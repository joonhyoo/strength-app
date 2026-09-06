import { getContext, setContext } from 'svelte';
import { countsTowardCompletion, exerciseComplete } from '$lib/complete';
import { setExerciseComplete, updateSet } from '$lib/services/programService.svelte';
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

	get progress() {
		const gradable = this.exercises.filter(countsTowardCompletion);
		if (gradable.length === 0) return 0;
		return gradable.filter(exerciseComplete).length / gradable.length;
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
		if (field === 'reps') {
			set.reps = value ? Number(value) : undefined;
		} else {
			set.weight = value || undefined;
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

	toggleComplete() {
		if (this.selectedIndex === null) return;
		const exercise = this.exercises[this.selectedIndex];
		const id = exercise.id;
		const next = !exercise.complete;
		exercise.complete = next;
		this.syncCache();
		if (!id) return;
		void setExerciseComplete(id, next).then((res) => {
			if (res.ok) {
				this.saveError = null;
				return;
			}
			// Put it back — the complete button reads this via exerciseComplete().
			const ex = this.exercises.find((e) => e.id === id);
			if (ex) {
				ex.complete = !next;
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
