import { getContext, setContext } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
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
	dayStatusFromExercises
} from '$lib/services/workoutService.svelte';
import { getBreadcrumb } from '$lib/services/programTemplateService.svelte';
import type { DayStatus } from '$lib/complete';
import type { Exercise, Breadcrumb } from '$lib/types';

// Local date-key helpers — deliberately not shared with
// $lib/server/programSchedule.ts: that module lives under $lib/server and
// SvelteKit forbids importing it (even for types re-exported as values, and
// this file needs real functions, not just types) into client-side code.
// The duplication is a handful of lines of plain Date arithmetic.
function toDateKey(date: Date): string {
	return date.toLocaleDateString('fr-CA');
}

// Plain Date throughout — scratch values for one-off calendar arithmetic, never
// held as reactive state (same reasoning as the plain Maps in
// workoutService.svelte.ts). DayEntry.date is likewise just a formatting input.
function parseDateKey(key: string): Date {
	const [y, m, d] = key.split('-').map(Number);
	return new Date(y, m - 1, d);
}

function addDaysToKey(key: string, n: number): string {
	const date = parseDateKey(key);
	date.setDate(date.getDate() + n);
	return toDateKey(date);
}

function mondayOfKey(key: string): string {
	const date = parseDateKey(key);
	const offset = (date.getDay() + 6) % 7; // Mon=0 .. Sun=6
	date.setDate(date.getDate() - offset);
	return toDateKey(date);
}

// Session-monotonic id for an optimistically-inserted exercise, swapped for the
// server's real id on success. Only ever matched with `===`, never parsed.
let tempSeq = 0;

export type Clipboard =
	| { type: 'day'; athleteId: string; athleteName: string; dateKey: string }
	| { type: 'week'; athleteId: string; athleteName: string; weekStart: string };

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

class CoachProgramState {
	selectedAthleteId = $state<string | null>(null);
	selectedDate = $state<Date>(new Date());
	modalOpen = $state(false);
	// Which form the add/edit modal shows: a full exercise, or a plain note.
	modalMode = $state<'exercise' | 'note'>('exercise');
	editingExercise = $state<Exercise | null>(null);
	statusMap = $state<SvelteMap<string, DayStatus>>(new SvelteMap());
	revision = $state(0);
	clipboard = $state<Clipboard | null>(null);
	assignModalOpen = $state(false);
	shiftModalOpen = $state(false);

	// The focused Monday–Sunday week's workout days — owned here (not in
	// WorkoutTimeline) so the add-exercise modal and the timeline mutate one
	// shared list. Every per-exercise edit applies to it immediately and
	// reconciles with the server in the background; see addExercise etc.
	weekDays = $state<DayEntry[]>([]);
	// Inline error shown in the timeline when an optimistic edit was rolled back.
	opError = $state<string | null>(null);
	// Temp ids of exercises inserted optimistically and still reconciling — the
	// timeline freezes (inert) their row so an edit can't fire against a temp id.
	pendingExerciseIds = $state(new SvelteSet<string>());

	// Overlapping week loads (athlete/week switch, a paste/assign/shift
	// reconcile) — only the newest may write weekDays.
	private weekLoadToken = 0;
	// In-flight optimistic ops; loadWeek waits on these so a background refresh
	// can't replace weekDays out from under an unreconciled edit. Plain Set —
	// only ever awaited.
	private pendingOps = new Set<Promise<unknown>>();

	get selectedDateKey(): string {
		return toDateKey(this.selectedDate);
	}

	get selectedWeekStart(): string {
		return mondayOfKey(this.selectedDateKey);
	}

	/** How many of the selected week's 7 days currently have anything scheduled. */
	get selectedWeekCount(): number {
		const start = this.selectedWeekStart;
		let n = 0;
		for (let i = 0; i < 7; i++) {
			const status = this.statusMap.get(addDaysToKey(start, i));
			if (status && status !== 'none') n++;
		}
		return n;
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

	// ---------------------------------------------------------------------
	// Per-exercise edits — each applies to weekDays + the day cache + the
	// calendar dot immediately, fires the server call in the background, and
	// reconciles (real id) or rolls back on failure. No `revision` bump: none
	// of these change the Program › Cycle › Week breadcrumb.
	// ---------------------------------------------------------------------

	private dayFor(dateKey: string): DayEntry | undefined {
		return this.weekDays.find((d) => d.dateKey === dateKey);
	}

	/** The visible day whose list currently holds `exerciseId` — edit/remove
	 *  identify their target by the exercise's own (globally unique) id, not by
	 *  which day happens to be focused. */
	private dayHolding(exerciseId: string): DayEntry | undefined {
		return this.weekDays.find((d) => d.exercises.some((e) => e.id === exerciseId));
	}

	/** Push a day's current list into the workout-day cache, so an optimistic
	 *  edit survives a cold reload before the next getWorkoutDay. */
	private syncDayCache(dateKey: string) {
		const day = this.dayFor(dateKey);
		if (this.selectedAthleteId !== null && day) {
			updateCachedWorkoutDay(this.selectedAthleteId, dateKey, day.exercises);
		}
	}

	private trackOptimistic<T>(op: Promise<T>): Promise<T> {
		this.pendingOps.add(op);
		void op.finally(() => this.pendingOps.delete(op));
		return op;
	}

	/** Background refetch of one day (server truth) — used to recover after a
	 *  reorder the server rejected, where the pre-drag order isn't recoverable
	 *  locally. */
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

	addExercise(dateKey: string, exercise: Exercise) {
		if (this.selectedAthleteId === null) return;
		this.opError = null;
		const athleteId = this.selectedAthleteId;
		const day = this.dayFor(dateKey);

		if (!day) {
			return this.trackOptimistic(
				(async () => {
					const res = await addExerciseToDay(athleteId, dateKey, exercise);
					if (!res.ok) this.opError = res.error || 'Could not add the exercise.';
					return res;
				})()
			);
		}

		const temp = `temp-${++tempSeq}`;
		day.exercises = [...day.exercises, { ...exercise, id: temp }];
		this.pendingExerciseIds.add(temp);
		this.syncDayCache(dateKey);
		this.setDayStatus(dateKey, day.exercises);

		return this.trackOptimistic(
			(async () => {
				const res = await addExerciseToDay(athleteId, dateKey, exercise);
				const d = this.dayFor(dateKey);
				if (res.ok) {
					const realId = (res.data as { id: string }).id;
					const target = d?.exercises.find((e) => e.id === temp);
					if (target) target.id = realId;
					this.syncDayCache(dateKey);
				} else {
					if (d) {
						d.exercises = d.exercises.filter((e) => e.id !== temp);
						this.syncDayCache(dateKey);
						this.setDayStatus(dateKey, d.exercises);
					}
					this.opError = res.error || 'Could not add the exercise — removed.';
				}
				this.pendingExerciseIds.delete(temp);
				return res;
			})()
		);
	}

	updateExercise(id: string, exercise: Exercise) {
		if (this.selectedAthleteId === null) return;
		this.opError = null;
		const day = this.dayHolding(id);
		const index = day?.exercises.findIndex((e) => e.id === id) ?? -1;

		if (!day || index === -1) {
			return this.trackOptimistic(
				(async () => {
					const res = await updateScheduledExercise(id, exercise);
					if (!res.ok) this.opError = res.error || 'Could not save the exercise.';
					return res;
				})()
			);
		}

		const dateKey = day.dateKey;
		const snapshot = day.exercises[index];
		// Keep the catalog-derived fields the edit form doesn't carry (exerciseId,
		// videoUrl); override the rest.
		day.exercises[index] = { ...snapshot, ...exercise, id };
		this.syncDayCache(dateKey);
		this.setDayStatus(dateKey, day.exercises);

		return this.trackOptimistic(
			(async () => {
				const res = await updateScheduledExercise(id, exercise);
				if (!res.ok) {
					const d = this.dayFor(dateKey);
					const i = d?.exercises.findIndex((e) => e.id === id) ?? -1;
					if (d && i !== -1) {
						d.exercises[i] = snapshot;
						this.syncDayCache(dateKey);
						this.setDayStatus(dateKey, d.exercises);
					}
					this.opError = res.error || 'Could not save the exercise — reverted.';
				}
				return res;
			})()
		);
	}

	removeExercise(id: string) {
		if (this.selectedAthleteId === null) return;
		this.opError = null;
		const day = this.dayHolding(id);
		const index = day?.exercises.findIndex((e) => e.id === id) ?? -1;

		if (!day || index === -1) {
			return this.trackOptimistic(
				(async () => {
					const res = await removeScheduledExercise(id);
					if (!res.ok) this.opError = res.error || 'Could not remove the exercise.';
					return res;
				})()
			);
		}

		const dateKey = day.dateKey;
		const [removed] = day.exercises.splice(index, 1);
		this.syncDayCache(dateKey);
		this.setDayStatus(dateKey, day.exercises);

		return this.trackOptimistic(
			(async () => {
				const res = await removeScheduledExercise(id);
				if (!res.ok) {
					const d = this.dayFor(dateKey);
					if (d && !d.exercises.some((e) => e.id === id)) {
						d.exercises.splice(Math.min(index, d.exercises.length), 0, removed);
						this.syncDayCache(dateKey);
						this.setDayStatus(dateKey, d.exercises);
					}
					this.opError = res.error || 'Could not remove the exercise — restored.';
				}
				return res;
			})()
		);
	}

	reorderExercise(dateKey: string, id: string, toIndex: number) {
		if (this.selectedAthleteId === null) return;
		this.opError = null;
		// WorkoutTimeline's DnD handler has already applied the new order to
		// weekDays; just persist it and let the server confirm.
		this.syncDayCache(dateKey);

		return this.trackOptimistic(
			(async () => {
				const res = await reorderScheduledExercise(id, toIndex);
				if (!res.ok) {
					this.opError = res.error || 'Could not reorder — reverted.';
					await this.refetchDay(dateKey);
				}
				return res;
			})()
		);
	}

	/**
	 * Loads the Monday–Sunday week containing `weekStart` into weekDays: paints
	 * whatever each day has cached, then reconciles every day (and its
	 * breadcrumb) independently. Waits out any in-flight optimistic edit first
	 * so a background refresh can't stomp it.
	 */
	async loadWeek(athleteId: string, weekStart: string) {
		const token = ++this.weekLoadToken;

		while (this.pendingOps.size > 0) {
			await Promise.allSettled([...this.pendingOps]);
			if (token !== this.weekLoadToken) return;
		}

		const keys = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i));

		this.weekDays = keys.map((dateKey) => {
			const cached = getCachedWorkoutDay(athleteId, dateKey);
			return {
				dateKey,
				date: parseDateKey(dateKey),
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
					const day = this.dayFor(dateKey);
					if (!day) return;
					day.exercises = list;
					day.loading = false;
					this.setDayStatus(dateKey, list);
				})
				.catch(() => {
					if (token !== this.weekLoadToken) return;
					const day = this.dayFor(dateKey);
					if (!day) return;
					day.loading = false;
					if (getCachedWorkoutDay(athleteId, dateKey) === null) day.loadError = true;
				});

			getBreadcrumb(athleteId, dateKey).then((result) => {
				if (token !== this.weekLoadToken) return;
				const day = this.dayFor(dateKey);
				if (day) day.crumb = result;
			});
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
		const from = new Date(now - 180 * DAY_MS);
		const to = new Date(now + 60 * DAY_MS);

		this.statusMap = await getAthleteStatusMap(this.selectedAthleteId, {
			from: from.toLocaleDateString('fr-CA'),
			to: to.toLocaleDateString('fr-CA')
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

	// Paste / assign / shift are server-orchestrated (deep copy with fresh ids,
	// or an RPC that generates a schedule from a template) — too much to
	// reconstruct client-side, so these keep a brief wait (assign/shift close
	// their modal immediately regardless — see AssignModal/ShiftModal). What's
	// optimistic here: only the affected week reloads (not the whole calendar),
	// and a failure surfaces as an inline error instead of silently doing
	// nothing.

	async pasteDay() {
		const cb = this.clipboard;
		if (!cb || cb.type !== 'day' || this.selectedAthleteId === null) return;
		const athleteId = this.selectedAthleteId;
		const destDateKey = this.selectedDateKey;
		const weekStart = this.selectedWeekStart;
		this.opError = null;

		const res = await pasteDayRequest(cb.athleteId, cb.dateKey, athleteId, destDateKey);
		if (!res.ok) {
			this.opError = res.error || 'Could not paste the day.';
			return;
		}
		this.revision++;
		await Promise.all([this.loadWeek(athleteId, weekStart), this.loadStatusMap()]);
	}

	async pasteWeek() {
		const cb = this.clipboard;
		if (!cb || cb.type !== 'week' || this.selectedAthleteId === null) return;
		const athleteId = this.selectedAthleteId;
		const weekStart = this.selectedWeekStart;
		this.opError = null;

		const res = await pasteWeekRequest(cb.athleteId, cb.weekStart, athleteId, weekStart);
		if (!res.ok) {
			this.opError = res.error || 'Could not paste the week.';
			return;
		}
		this.revision++;
		await Promise.all([this.loadWeek(athleteId, weekStart), this.loadStatusMap()]);
	}

	async clearWeek() {
		if (this.selectedAthleteId === null) return;
		this.opError = null;
		const athleteId = this.selectedAthleteId;
		const weekStart = this.selectedWeekStart;

		// Empty the week's days locally (and in the cache) straight away. Bump the
		// load token first so a still-in-flight day fetch can't repopulate one.
		this.weekLoadToken++;
		const snapshots = this.weekDays.map((d) => ({ dateKey: d.dateKey, exercises: d.exercises }));
		for (const d of this.weekDays) {
			d.exercises = [];
			updateCachedWorkoutDay(athleteId, d.dateKey, []);
			this.setDayStatus(d.dateKey, []);
		}
		this.revision++;

		const res = await clearWeekRequest(athleteId, weekStart);
		if (!res.ok) {
			for (const s of snapshots) {
				const d = this.dayFor(s.dateKey);
				if (d) {
					d.exercises = s.exercises;
					updateCachedWorkoutDay(athleteId, s.dateKey, s.exercises);
					this.setDayStatus(s.dateKey, s.exercises);
				}
			}
			this.revision++;
			this.opError = res.error || 'Could not clear the week — restored.';
			return;
		}
		// Reconcile per-day breadcrumbs (clearing can drop a program label) and dots.
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
		this.revision++;
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
