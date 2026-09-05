import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import {
	addExerciseToDay,
	updateExercise as updateScheduledExercise,
	removeExercise as removeScheduledExercise,
	reorderExercise as reorderScheduledExercise,
	setExerciseComplete,
	pasteDay as pasteDayRequest,
	pasteWeek as pasteWeekRequest,
	clearWeek as clearWeekRequest
} from '$lib/services/programService.svelte';
import {
	getAthleteStatusMap,
	getCachedStatusMap,
	dayStatusFromExercises
} from '$lib/services/workoutService.svelte';
import type { DayStatus } from '$lib/complete';
import type { Exercise } from '$lib/types';

// Local date-key helpers — deliberately not shared with
// $lib/server/programSchedule.ts: that module lives under $lib/server and
// SvelteKit forbids importing it (even for types re-exported as values, and
// this file needs real functions, not just types) into client-side code.
// The duplication is a handful of lines of plain Date arithmetic.
function toDateKey(date: Date): string {
	return date.toLocaleDateString('fr-CA');
}

function addDaysToKey(key: string, n: number): string {
	const [y, m, d] = key.split('-').map(Number);
	// Plain Date: function-local scratch value for a one-off calculation,
	// never read reactively by the template (same reasoning as the plain
	// Maps in workoutService.svelte.ts).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const date = new Date(y, m - 1, d);
	date.setDate(date.getDate() + n);
	return toDateKey(date);
}

function mondayOfKey(key: string): string {
	const [y, m, d] = key.split('-').map(Number);
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const date = new Date(y, m - 1, d);
	const offset = (date.getDay() + 6) % 7; // Mon=0 .. Sun=6
	date.setDate(date.getDate() - offset);
	return toDateKey(date);
}

export type Clipboard =
	| { type: 'day'; athleteId: string; athleteName: string; dateKey: string }
	| { type: 'week'; athleteId: string; athleteName: string; weekStart: string };

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

	async saveExercise(exercise: Exercise) {
		if (this.selectedAthleteId === null) return;
		const dateKey = this.selectedDate.toLocaleDateString('fr-CA');
		const editingId = this.editingExercise?.id;
		if (editingId) {
			await updateScheduledExercise(editingId, exercise);
		} else {
			await addExerciseToDay(this.selectedAthleteId, dateKey, exercise);
		}
		// The revision bump makes WorkoutTimeline re-fetch this day, which then
		// reports the fresh status via setDayStatus — no separate status-map
		// round trip needed just to update one dot.
		this.revision++;
	}

	async removeExercise(athleteExerciseId: string) {
		await removeScheduledExercise(athleteExerciseId);
		this.revision++;
	}

	async reorderExercise(athleteExerciseId: string, toIndex: number) {
		await reorderScheduledExercise(athleteExerciseId, toIndex);
		this.revision++;
	}

	async toggleExerciseComplete(athleteExerciseId: string, complete: boolean) {
		await setExerciseComplete(athleteExerciseId, complete);
		this.revision++;
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

	/** Which of the merged copy/paste affordances a day cell should show:
	 * 'cancel' on the day that's currently copied, 'paste' on every other day
	 * once something's on the clipboard, 'copy' otherwise. */
	dayClipboardMode(athleteId: string, dateKey: string): 'copy' | 'paste' | 'cancel' {
		const cb = this.clipboard;
		if (cb?.type !== 'day') return 'copy';
		if (cb.athleteId === athleteId && cb.dateKey === dateKey) return 'cancel';
		return 'paste';
	}

	/** Same three-way state for the selected week's toolbar button. */
	get weekClipboardMode(): 'copy' | 'paste' | 'cancel' {
		const cb = this.clipboard;
		if (cb?.type !== 'week') return 'copy';
		if (cb.athleteId === this.selectedAthleteId && cb.weekStart === this.selectedWeekStart)
			return 'cancel';
		return 'paste';
	}

	async pasteDay() {
		if (!this.clipboard || this.clipboard.type !== 'day' || this.selectedAthleteId === null) return;
		await pasteDayRequest(
			this.clipboard.athleteId,
			this.clipboard.dateKey,
			this.selectedAthleteId,
			this.selectedDateKey
		);
		// One paste per copy — clearing here resets every day's button back to
		// "Copy" and dismisses the toast.
		this.clipboard = null;
		this.revision++;
		await this.loadStatusMap();
	}

	async pasteWeek() {
		if (!this.clipboard || this.clipboard.type !== 'week' || this.selectedAthleteId === null)
			return;
		await pasteWeekRequest(
			this.clipboard.athleteId,
			this.clipboard.weekStart,
			this.selectedAthleteId,
			this.selectedWeekStart
		);
		this.clipboard = null;
		this.revision++;
		await this.loadStatusMap();
	}

	async clearWeek() {
		if (this.selectedAthleteId === null) return;
		await clearWeekRequest(this.selectedAthleteId, this.selectedWeekStart);
		this.revision++;
		await this.loadStatusMap();
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

	/** Called after a successful assign/shift to refresh the calendar dots and breadcrumb. */
	async onScheduleChanged() {
		this.assignModalOpen = false;
		this.shiftModalOpen = false;
		this.revision++;
		await this.loadStatusMap();
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
