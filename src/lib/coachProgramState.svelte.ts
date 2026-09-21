import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import {
	addExerciseToDay,
	updateExercise as updateScheduledExercise,
	removeExercise as removeScheduledExercise,
	reorderExercise as reorderScheduledExercise,
	pasteDay as pasteDayRequest,
	pasteWeek as pasteWeekRequest,
	clearWeek as clearWeekRequest
} from '$lib/services/programService.svelte';
import {
	getWorkoutDay,
	getCachedWorkoutDay,
	updateCachedWorkoutDay,
	getAthleteStatusMap,
	getCachedStatusMap,
	getAthleteRangeExercises,
	dayStatusFromExercises
} from '$lib/services/workoutService.svelte';
import { runWrite, writeQueueBusy } from '$lib/writeQueue.svelte';
import { getBreadcrumb } from '$lib/services/programTemplateService.svelte';
import { toKey, parseKey, addDays, mondayOf } from '$lib/dateKey';
import {
	type Clipboard,
	dayClipboardMode as computeDayClipboardMode,
	weekClipboardMode as computeWeekClipboardMode
} from '$lib/coachClipboard';
import type { DayStatus } from '$lib/complete';
import type { Exercise, Breadcrumb } from '$lib/types';

export type { Clipboard };

/** One day of the focused week in the training timeline. Each carries its own
 *  load state so one slow or failed day never blocks the rest. */
export interface DayEntry {
	dateKey: string;
	date: Date;
	exercises: Exercise[];
	loading: boolean;
	loadError: boolean;
	/** This day's own program/rest-day label — null until resolved. */
	crumb: Breadcrumb | null;
}

/** Every write resolves with `{ ok }` (optionally an error message or the
 *  server's payload) — values that already raced here are no longer read
 *  optimistically, so the data field stays for postApi's shape. */
type OpResult = { ok: boolean; error?: string; data?: unknown };

class CoachProgramState {
	selectedAthleteId = $state<string | null>(null);
	selectedDate = $state<Date>(new Date());
	modalOpen = $state(false);
	// Which form the add/edit modal shows: a full exercise, or a plain note.
	modalMode = $state<'exercise' | 'note'>('exercise');
	editingExercise = $state<Exercise | null>(null);
	statusMap = $state<SvelteMap<string, DayStatus>>(new SvelteMap());
	clipboard = $state<Clipboard | null>(null);
	assignModalOpen = $state(false);
	shiftModalOpen = $state(false);

	// The focused Monday–Sunday week's workout days — owned here (not in
	// WorkoutTimeline) so the add-exercise modal and the timeline mutate one
	// shared list. Every per-exercise write is serialised through writeQueue:
	// the row only appears after the server saves, then the day re-fetches
	// server truth (see refetchDay).
	weekDays = $state<DayEntry[]>([]);
	// The full-month grid's days — a separate array from weekDays (rather than
	// a shared cache) so week view stays untouched; kept fresh by re-running
	// loadMonth every time month view mounts. See activeView below for why
	// dayFor/dayHolding need to know which of the two is "live".
	monthDays = $state<DayEntry[]>([]);
	// Which view is currently mounted — written by +page.svelte whenever the
	// ?view= toggle changes. weekDays/monthDays aren't cleared when the other
	// view is active, so a mutation issued from the visible view must prefer
	// that view's array or it can silently write into the other, stale one.
	activeView = $state<'week' | 'month'>('week');
	// Inline error shown in the timeline when a write fails.
	opError = $state<string | null>(null);
	// Bumped by the page when the browser tab becomes visible again. Whichever
	// view is mounted reads it in its load effect, so it re-runs and refreshes.
	refreshTick = $state(0);

	// Overlapping week loads (athlete/week switch, a paste/assign/shift
	// reconcile) — only the newest may write weekDays.
	private weekLoadToken = 0;
	// Same idea for loadMonth/monthDays.
	private monthLoadToken = 0;

	/** True while a write is queued or running — disables submit buttons and
	 *  drag-and-drop so an edit can't fire mid-save. */
	get busy(): boolean {
		return writeQueueBusy();
	}

	get selectedDateKey(): string {
		return toKey(this.selectedDate);
	}

	get selectedWeekStart(): string {
		return mondayOf(this.selectedDateKey);
	}

	/** How many of the selected week's 7 days currently have anything scheduled. */
	get selectedWeekCount(): number {
		const start = this.selectedWeekStart;
		let n = 0;
		for (let i = 0; i < 7; i++) {
			const status = this.statusMap.get(addDays(start, i));
			if (status && status !== 'none') n++;
		}
		return n;
	}

	/** The loaded week's Program › Cycle › Week crumb, taken from whichever day
	 * carries a session link — every on-program day of a week shares the same
	 * program/cycle/week, so the line stays put as the coach clicks between
	 * workout and rest days. Null for an off-program or cleared week (clearing
	 * reloads every day's crumb to null), even once exercises are added back. */
	get selectedWeekCrumb(): Breadcrumb | null {
		return this.weekDays.find((d) => d.crumb !== null)?.crumb ?? null;
	}

	selectAthlete(id: string | null) {
		this.selectedAthleteId = id;
	}

	selectDate(date: Date) {
		this.selectedDate = date;
	}

	openModal(mode: 'exercise' | 'note' = 'exercise') {
		this.editingExercise = null;
		this.modalMode = mode;
		this.modalOpen = true;
	}

	openEdit(exercise: Exercise) {
		this.editingExercise = exercise;
		this.modalMode = exercise.category === 'note' ? 'note' : 'exercise';
		this.modalOpen = true;
	}

	closeModal() {
		this.modalOpen = false;
		this.editingExercise = null;
	}

	/** Prefers whichever of weekDays/monthDays belongs to the currently mounted
	 *  view — the other array can be stale (nothing keeps it fresh while its
	 *  view isn't mounted), so it's only a fallback. loadWeek/loadMonth/clearWeek
	 *  never call this — they only ever touch the one array they own directly. */
	private dayFor(dateKey: string): DayEntry | undefined {
		const [primary, secondary] =
			this.activeView === 'month'
				? [this.monthDays, this.weekDays]
				: [this.weekDays, this.monthDays];
		return (
			primary.find((d) => d.dateKey === dateKey) ?? secondary.find((d) => d.dateKey === dateKey)
		);
	}

	/** The visible day whose list currently holds `exerciseId` — edit/remove
	 *  identify their target by the exercise's own (globally unique) id, not by
	 *  which day happens to be focused. Same active-view bias as dayFor. */
	private dayHolding(exerciseId: string): DayEntry | undefined {
		const [primary, secondary] =
			this.activeView === 'month'
				? [this.monthDays, this.weekDays]
				: [this.weekDays, this.monthDays];
		return (
			primary.find((d) => d.exercises.some((e) => e.id === exerciseId)) ??
			secondary.find((d) => d.exercises.some((e) => e.id === exerciseId))
		);
	}

	/** Push a day's current list into the workout-day cache, so a drag-reorder
	 *  survives a cold reload before the next getWorkoutDay. */
	private syncDayCache(dateKey: string) {
		const day = this.dayFor(dateKey);
		if (this.selectedAthleteId !== null && day) {
			updateCachedWorkoutDay(this.selectedAthleteId, dateKey, day.exercises);
		}
	}

	/** Re-fetch one day (server truth) after a write. Also updates the
	 *  workout-day cache and the calendar dot, so cache-first paints and month
	 *  view stay in sync with what actually saved. */
	private async refetchDay(dateKey: string) {
		if (this.selectedAthleteId === null) return;
		const athleteId = this.selectedAthleteId;
		try {
			const list = await getWorkoutDay(athleteId, dateKey);
			const day = this.dayFor(dateKey);
			if (day && this.selectedAthleteId === athleteId) {
				day.exercises = list;
				day.loading = false;
				day.loadError = false;
				this.setDayStatus(dateKey, list);
			}
		} catch {
			// Keep the current view; the next loadWeek will retry.
		}
	}

	/** Runs `call` through the serial write queue. On failure the inline
	 *  error banner shows `failMessage` and nothing changed locally; on success
	 *  `refresh` runs (still on the queue) so a write and its reload can't
	 *  interleave with another write. Resolves with the OpResult. */
	private write(
		call: () => Promise<OpResult>,
		failMessage: string,
		refresh?: () => void | Promise<void>
	): Promise<OpResult> {
		return runWrite(async () => {
			const res = await call();
			if (!res.ok) {
				this.opError = res.error || failMessage;
				return res;
			}
			await refresh?.();
			return res;
		});
	}

	// ---------------------------------------------------------------------
	// Per-exercise writes — each runs through the serial write queue, then
	// re-fetches the affected day so what's shown is always server truth. On
	// failure nothing changed locally; the opError banner explains why. None
	// touch weekDays[].crumb, so the Program › Cycle › Week breadcrumb holds
	// steady even when a day's exercises change.
	// ---------------------------------------------------------------------

	addExercise(dateKey: string, exercise: Exercise): Promise<OpResult> {
		if (this.selectedAthleteId === null)
			return Promise.resolve({ ok: false, error: 'No athlete selected.' });
		this.opError = null;
		const athleteId = this.selectedAthleteId;

		return this.write(
			() => addExerciseToDay(athleteId, dateKey, exercise),
			'Could not add the exercise.',
			() => this.refetchDay(dateKey)
		);
	}

	updateExercise(id: string, exercise: Exercise): Promise<OpResult> {
		if (this.selectedAthleteId === null)
			return Promise.resolve({ ok: false, error: 'No athlete selected.' });
		this.opError = null;
		const day = this.dayHolding(id);
		const dateKey = day?.dateKey;

		return this.write(
			() => updateScheduledExercise(id, exercise),
			'Could not save the exercise.',
			() => (dateKey ? this.refetchDay(dateKey) : undefined)
		);
	}

	removeExercise(id: string): Promise<OpResult> {
		if (this.selectedAthleteId === null)
			return Promise.resolve({ ok: false, error: 'No athlete selected.' });
		this.opError = null;
		const day = this.dayHolding(id);
		const dateKey = day?.dateKey;

		return this.write(
			() => removeScheduledExercise(id),
			'Could not remove the exercise.',
			() => (dateKey ? this.refetchDay(dateKey) : undefined)
		);
	}

	/** Drag-reorder stays optimistic: WorkoutTimeline's DnD handler has already
	 *  applied the new order to the day's list; this just persists it through
	 *  the queue and snaps back from server truth if the server rejects it. */
	reorderExercise(dateKey: string, id: string, toIndex: number) {
		if (this.selectedAthleteId === null) return;
		this.opError = null;
		// WorkoutTimeline's DnD handler has already applied the new order; keep
		// the cache warm so a cold reload keeps it.
		this.syncDayCache(dateKey);

		return runWrite(async () => {
			const res = await reorderScheduledExercise(id, toIndex);
			if (!res.ok) {
				this.opError = res.error || 'Could not reorder — reverted.';
				await this.refetchDay(dateKey);
			}
			return res;
		});
	}

	/**
	 * Loads the Monday–Sunday week containing `weekStart` into weekDays: paints
	 * whatever each day has cached, then reconciles every day (and its
	 * breadcrumb) independently. No writes settle optimistically anymore, so a
	 * fresh load can't stomp an unreconciled edit — the write queue already
	 * serialises those and their reloads.
	 */
	async loadWeek(athleteId: string, weekStart: string) {
		const token = ++this.weekLoadToken;

		const keys = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

		this.weekDays = keys.map((dateKey) => {
			const cached = getCachedWorkoutDay(athleteId, dateKey);
			return {
				dateKey,
				date: parseKey(dateKey),
				exercises: cached ?? [],
				loading: cached === null,
				loadError: false,
				crumb: null
			};
		});

		for (const dateKey of keys) {
			getWorkoutDay(athleteId, dateKey)
				.then((list) => {
					if (token !== this.weekLoadToken) return;
					const day = this.weekDays.find((d) => d.dateKey === dateKey);
					if (!day) return;
					day.exercises = list;
					day.loading = false;
					this.setDayStatus(dateKey, list);
					// getBreadcrumb only resolves a crumb for a day that carries its
					// own program session link — a rest day, an ad-hoc day, or a
					// day in a cleared week all come back null, so the timeline
					// shows no "Upper A" tag and the page hides the Program ›
					// Cycle › Week line for the whole week.
					if (list.length === 0) {
						day.crumb = null;
						return;
					}
					getBreadcrumb(athleteId, dateKey)
						.then((result) => {
							if (token !== this.weekLoadToken) return;
							const d = this.weekDays.find((d) => d.dateKey === dateKey);
							if (d) d.crumb = result;
						})
						.catch((e) => console.warn('[breadcrumb] week load failed', dateKey, e));
				})
				.catch(() => {
					if (token !== this.weekLoadToken) return;
					const day = this.weekDays.find((d) => d.dateKey === dateKey);
					if (!day) return;
					day.loading = false;
					if (getCachedWorkoutDay(athleteId, dateKey) === null) day.loadError = true;
				});
		}
	}

	/**
	 * Loads a Monday-aligned, full-weeks range into monthDays: paints whatever's
	 * cached per day, then reconciles the whole range with one bulk fetch — the
	 * month grid is too wide for loadWeek's N-parallel-requests approach to stay
	 * cheap. Skips per-day breadcrumb fetching entirely: month view never shows
	 * a Program › Cycle › Week line. Still warms the per-day workout-day cache,
	 * so switching to week view repaints instantly from data this already
	 * fetched.
	 */
	async loadMonth(athleteId: string, keys: string[]) {
		const token = ++this.monthLoadToken;

		this.monthDays = keys.map((dateKey) => {
			const cached = getCachedWorkoutDay(athleteId, dateKey);
			return {
				dateKey,
				date: parseKey(dateKey),
				exercises: cached ?? [],
				loading: cached === null,
				loadError: false,
				crumb: null
			};
		});

		try {
			const byDate = await getAthleteRangeExercises(athleteId, {
				from: keys[0],
				to: keys[keys.length - 1]
			});
			if (token !== this.monthLoadToken) return;

			for (const dateKey of keys) {
				const day = this.monthDays.find((d) => d.dateKey === dateKey);
				if (!day) continue;
				const list = byDate.get(dateKey) ?? [];
				day.exercises = list;
				day.loading = false;
				this.setDayStatus(dateKey, list);
				updateCachedWorkoutDay(athleteId, dateKey, list);
			}
		} catch {
			if (token !== this.monthLoadToken) return;
			for (const day of this.monthDays) {
				day.loading = false;
				if (getCachedWorkoutDay(athleteId, day.dateKey) === null) day.loadError = true;
			}
		}
	}

	/** Updates one day's dot locally from exercises already fetched, avoiding a full status-map refetch. */
	setDayStatus(dateKey: string, exercises: Exercise[]) {
		this.statusMap.set(dateKey, dayStatusFromExercises(exercises));
	}

	async loadStatusMap() {
		if (this.selectedAthleteId === null) return;

		// Paint whatever we already know for this athlete, then reconcile.
		const cached = getCachedStatusMap(this.selectedAthleteId);
		if (cached) this.statusMap = cached;

		const DAY_MS = 24 * 60 * 60 * 1000;
		const now = Date.now();

		this.statusMap = await getAthleteStatusMap(this.selectedAthleteId, {
			from: toKey(new Date(now - 180 * DAY_MS)),
			to: toKey(new Date(now + 60 * DAY_MS))
		});
	}

	// ---------------------------------------------------------------------
	// Clipboard — copy is a pure client-side reference to a location (never
	// the exercise data itself), matching how the rest of this class already
	// treats the server as the source of truth. The actual read + warn-and-
	// replace write both happen server-side inside pasteDay/pasteWeek, which
	// is also what lets a paste carry the source day's program/session
	// breadcrumb link across athletes.
	// ---------------------------------------------------------------------

	copyDay(athleteName: string) {
		if (this.selectedAthleteId === null) return;
		this.clipboard = {
			type: 'day',
			athleteId: this.selectedAthleteId,
			athleteName,
			dateKey: this.selectedDateKey
		};
	}

	copyWeek(athleteName: string) {
		if (this.selectedAthleteId === null) return;
		this.clipboard = {
			type: 'week',
			athleteId: this.selectedAthleteId,
			athleteName,
			weekStart: this.selectedWeekStart
		};
	}

	clearClipboard() {
		this.clipboard = null;
	}

	dayClipboardMode(athleteId: string, dateKey: string): 'copy' | 'paste' | 'cancel' {
		return computeDayClipboardMode(this.clipboard, athleteId, dateKey);
	}

	get weekClipboardMode(): 'copy' | 'paste' | 'cancel' {
		return computeWeekClipboardMode(this.clipboard, this.selectedAthleteId, this.selectedWeekStart);
	}

	// Paste / assign / shift are server-orchestrated (deep copy with fresh ids,
	// or an RPC that generates a schedule from a template) — too much to
	// reconstruct client-side, so these request through the write queue and
	// reload the affected week on success. Only the affected week reloads, not
	// the whole calendar, and a failure surfaces as the inline opError banner.

	async pasteDay() {
		const cb = this.clipboard;
		if (!cb || cb.type !== 'day' || this.selectedAthleteId === null) return;
		const athleteId = this.selectedAthleteId;
		const destDateKey = this.selectedDateKey;
		const weekStart = this.selectedWeekStart;
		this.opError = null;

		const res = await runWrite(() => pasteDayRequest(cb.athleteId, cb.dateKey, athleteId, destDateKey));
		if (!res.ok) {
			this.opError = res.error || 'Could not paste the day.';
			return;
		}
		// One paste per copy — clearing here resets every day's button back to
		// "Copy" and dismisses the toast.
		this.clipboard = null;
		await Promise.all([this.loadWeek(athleteId, weekStart), this.loadStatusMap()]);
	}

	async pasteWeek() {
		const cb = this.clipboard;
		if (!cb || cb.type !== 'week' || this.selectedAthleteId === null) return;
		const athleteId = this.selectedAthleteId;
		const weekStart = this.selectedWeekStart;
		this.opError = null;

		const res = await runWrite(() => pasteWeekRequest(cb.athleteId, cb.weekStart, athleteId, weekStart));
		if (!res.ok) {
			this.opError = res.error || 'Could not paste the week.';
			return;
		}
		this.clipboard = null;
		await Promise.all([this.loadWeek(athleteId, weekStart), this.loadStatusMap()]);

		// The paste itself succeeded, but individual days can still fail. A failed
		// day is left as it was (not wiped) — surface it so a partial paste
		// doesn't look clean; the server log has the reason per failed date.
		const summary = res.data as { pastedCount: number; failedCount: number } | undefined;
		if (summary && summary.failedCount > 0) {
			const total = summary.pastedCount + summary.failedCount;
			this.opError = `Pasted ${summary.pastedCount} of ${total} days — ${summary.failedCount} unchanged (paste failed; check server logs).`;
		}
	}

	async clearWeek() {
		if (this.selectedAthleteId === null) return;
		this.opError = null;
		const athleteId = this.selectedAthleteId;
		const weekStart = this.selectedWeekStart;

		// No optimistic empty — the week stays on screen until the server
		// confirms, then reloads cleared (breadcrumbs included).
		const res = await runWrite(() => clearWeekRequest(athleteId, weekStart));
		if (!res.ok) {
			this.opError = res.error || 'Could not clear the week.';
			return;
		}
		// Reload per-day breadcrumbs (getBreadcrumb returns null for every day
		// whose program link this just deleted) and calendar dots.
		await Promise.all([this.loadWeek(athleteId, weekStart), this.loadStatusMap()]);
	}

	// ---------------------------------------------------------------------
	// Assign / shift modals — mirrors modalOpen/editingExercise's pattern:
	// this class tracks only which modal is open, the modal component itself
	// owns its own form-field state locally.
	// ---------------------------------------------------------------------

	openAssignModal() {
		this.assignModalOpen = true;
	}

	closeAssignModal() {
		this.assignModalOpen = false;
	}

	openShiftModal() {
		this.shiftModalOpen = true;
	}

	closeShiftModal() {
		this.shiftModalOpen = false;
	}

	/** Called after a successful assign/shift to refresh the visible week, the
	 *  calendar dots and the breadcrumb. */
	async onScheduleChanged() {
		this.assignModalOpen = false;
		this.shiftModalOpen = false;
		if (this.selectedAthleteId === null) return;
		await Promise.all([
			this.loadWeek(this.selectedAthleteId, this.selectedWeekStart),
			this.loadStatusMap()
		]);
	}
}

const COACH_KEY = Symbol('coach-program-state');

export function initCoachProgramState() {
	const state = new CoachProgramState();
	setContext(COACH_KEY, state);
	return state;
}

export function getCoachProgramState(): CoachProgramState {
	return getContext(COACH_KEY);
}
