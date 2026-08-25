import { getContext, setContext } from 'svelte';
import { exerciseComplete } from '$lib/complete';
import { setExerciseComplete, updateSet } from '$lib/services/programService.svelte';
import { updateCachedWorkoutDay } from '$lib/services/workoutService.svelte';
import type { Exercise } from '$lib/types';

class WorkoutState {
	exercises = $state<Exercise[]>([]);
	selectedIndex = $state<number | null>(null);
	private athleteId = '';
	private dateKey = '';

	get selected() {
		return this.selectedIndex !== null ? this.exercises[this.selectedIndex] : null;
	}

	get hasPrev() {
		return this.selectedIndex !== null && this.selectedIndex > 0;
	}

	get hasNext() {
		return this.selectedIndex !== null && this.selectedIndex < this.exercises.length - 1;
	}

	get progress() {
		if (this.exercises.length === 0) return 0;
		return this.exercises.filter(exerciseComplete).length / this.exercises.length;
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
		this.selectedIndex = i;
	}

	close() {
		this.selectedIndex = null;
	}

	prev() {
		if (this.selectedIndex === null || !this.hasPrev) return;
		this.selectedIndex--;
	}

	next() {
		if (this.selectedIndex === null || !this.hasNext) return;
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
		if (set.id) updateSet(set.id, field, value);
	}

	toggleComplete() {
		if (this.selectedIndex === null) return;
		const exercise = this.exercises[this.selectedIndex];
		exercise.complete = !exercise.complete;
		this.syncCache();
		if (exercise.id) setExerciseComplete(exercise.id, exercise.complete);
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
