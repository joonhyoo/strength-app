import type { Exercise, ExerciseCategory } from '$lib/types';

export const CONDITIONING_CATEGORIES: readonly ExerciseCategory[] = ['warmup', 'circuit', 'plyo'];

/** A note is coach→athlete text with nothing to perform — it is excluded
 *  entirely from day-completion / progress math (never numerator or denominator). */
export function countsTowardCompletion(exercise: Pick<Exercise, 'category'>): boolean {
	return exercise.category !== 'note';
}

export function exerciseComplete(exercise: Exercise): boolean {
	if (exercise.category === 'note') return false;
	if (CONDITIONING_CATEGORIES.includes(exercise.category)) return exercise.complete;
	return exercise.performed.length > 0 && exercise.performed.every((set) => !!set.weight);
}

export type DayStatus = 'none' | 'exists' | 'in_progress' | 'complete';
