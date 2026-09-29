import { getContext, setContext } from 'svelte';
import { countsTowardCompletion, exerciseComplete, isSetEntryComplete } from '$lib/complete';
import { setSetDone, updateSet } from '$lib/services/programService.svelte';
import { updateCachedWorkoutDay } from '$lib/services/workoutService.svelte';
import type { Exercise } from '$lib/types';

class WorkoutState {
	exercises = $state<Exercise[]>([]);
	selectedIndex = $state<number | null>(null);
	// Set when a background set-log / completion-toggle write failed. A failed
	// completion toggle also reverts; a failed set edit can't (the inputs are
	// one-way), so this line is the only signal the athlete gets.
	saveError = $state<string | null>(null);
	// Reactive so `location` (read by the open exercise modal) stays correct if
	// the day changes underneath it.
	private athleteId = $state('');
	private dateKey = $state('');

	get selected() {
		return this.selectedIndex !== null ? this.exercises[this.selectedIndex] : null;
	}

	get hasPrev() {
		return this.selectedIndex !== null && this.selectedIndex > 0;
	}

	get hasNext() {
		return this.selectedIndex !== null && this.selectedIndex < this.exercises.length - 1;
	}

	/** Which athlete + day the open workout belongs to — for the exercise
	 *  modal's "previous sessions" lookup. */
	get location() {
		return { athleteId: this.athleteId, dateKey: this.dateKey };
	}

	/**
	 * Fraction of the day's units of work the athlete has completed, 0..1.
	 * Per-unit rather than per-exercise because the units are what the model
	 * actually tracks — a 5-set lift is 5 units, not one — so a progress bar
	 * reads "3 of 5 sets" without a second source of truth. Not currently
	 * rendered anywhere; kept as the one place that number is derived.
	 */
	get progress() {
		const units = this.exercises
			.filter(countsTowardCompletion)
			.flatMap((ex) => ex.performed.map((set) => isSetEntryComplete(ex, set)));
		if (units.length === 0) return 0;
		return units.filter(Boolean).length / units.length;
	}

	/** Which day's cache entry logSet/toggleComplete write optimistic edits back into. */
	setLocation(athleteId: string, dateKey: string) {
		this.athleteId = athleteId;
		this.dateKey = dateKey;
	}

	/**
	 * `preserveSelection` is for background revalidation: fresh data landing while
	 * an exercise is open must not yank the modal shut, so the selection follows
	 * the exercise id rather than its index.
	 */
	setDay(exercises: Exercise[], preserveSelection = false) {
		const openId = preserveSelection ? this.selected?.id : undefined;
		this.exercises = exercises;

		if (openId === undefined) {
			this.selectedIndex = null;
			return;
		}

		const next = exercises.findIndex((e) => e.id === openId);
		this.selectedIndex = next === -1 ? null : next;
	}

	open(i: number) {
		this.saveError = null;
		this.selectedIndex = i;
	}

	close() {
		this.saveError = null;
		this.selectedIndex = null;
	}

	prev() {
		if (this.selectedIndex === null || !this.hasPrev) return;
		this.saveError = null;
		this.selectedIndex--;
	}

	next() {
		if (this.selectedIndex === null || !this.hasNext) return;
		this.saveError = null;
		this.selectedIndex++;
	}

	/** Persists the current in-memory list into the day cache immediately,
	 * so an optimistic edit isn't lost on a cold reload before the next
	 * natural `getWorkoutDay` call. */
	private syncCache() {
		if (!this.athleteId || !this.dateKey) return;
		updateCachedWorkoutDay(this.athleteId, this.dateKey, this.exercises);
	}

	logSet(setIndex: number, field: 'weight' | 'reps', value: string) {
		if (this.selectedIndex === null) return;
		const exercise = this.exercises[this.selectedIndex];
		const set = exercise.performed[setIndex];
		// An emptied input clears the field (null = not entered), which is what
		// un-completes a set. A logged '0' survives both, since '0' is truthy as
		// a string and the column is text.
		if (field === 'reps') {
			set.reps = value ? Number(value) : null;
		} else {
			set.weight = value || null;
		}
		this.syncCache();
		// The set inputs are one-way (value=, not bind:), so a failed write can't
		// be un-typed — just tell the athlete it didn't save.
		if (set.id) {
			void updateSet(set.id, field, value).then((res) => {
				this.saveError = res.ok ? null : 'Couldn’t save — check your connection.';
			});
		}
	}

	/**
	 * Taps one unit of work. Only conditioning exercises have a tappable unit
	 * (their single one); a weight set is completed by entering its weight in
	 * `logSet`, so the UI hides this button for them — see `completeInteractive`
	 * in WorkoutModal.
	 */
	toggleUnitDone(setIndex: number) {
		if (this.selectedIndex === null) return;
		const exercise = this.exercises[this.selectedIndex];
		const set = exercise.performed[setIndex];
		if (!set) return;
		const id = set.id;
		const next = !set.done;
		set.done = next;
		this.syncCache();
		if (!id) return;
		void setSetDone(id, next).then((res) => {
			if (res.ok) {
				this.saveError = null;
				return;
			}
			// Put it back — the complete button reads this via exerciseComplete().
			const ex = this.exercises.find((e) => e.id === exercise.id);
			const back = ex?.performed[setIndex];
			if (back) {
				back.done = !next;
				this.syncCache();
			}
			this.saveError = 'Couldn’t save — check your connection.';
		});
	}

	isComplete(exercise: Exercise) {
		return exerciseComplete(exercise);
	}
}

const WORKOUT_KEY = Symbol('workout-state');

export function initWorkoutState() {
	const state = new WorkoutState();
	setContext(WORKOUT_KEY, state);
	return state;
}

export function getWorkoutState() {
	return getContext<WorkoutState>(WORKOUT_KEY);
}
