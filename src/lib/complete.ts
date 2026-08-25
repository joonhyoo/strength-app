import type { Exercise, ExerciseCategory } from '$lib/types';

export const CONDITIONING_CATEGORIES: readonly ExerciseCategory[] = ['warmup', 'circuit', 'plyo'];

export function exerciseComplete(exercise: Exercise): boolean {
	if (CONDITIONING_CATEGORIES.includes(exercise.category)) return exercise.complete;
	return exercise.performed.length > 0 && exercise.performed.every((set) => !!set.weight);
}

export type DayStatus = 'none' | 'exists' | 'in_progress' | 'complete';
