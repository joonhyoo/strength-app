import type { Exercise } from '$lib/types';

const conditioning = ['warmup', 'circuit', 'plyo'];

export function exerciseComplete(exercise: Exercise): boolean {
	if (conditioning.includes(exercise.category)) return exercise.complete;
	return exercise.performed.length > 0 && exercise.performed.every((set) => !!set.weight);
}

export type DayStatus = 'none' | 'exists' | 'in_progress' | 'complete';
