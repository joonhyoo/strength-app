import type { ConditioningCategory, Exercise } from '$lib/types';

export const CONDITIONING_CATEGORIES: readonly ConditioningCategory[] = [
	'warmup',
	'circuit',
	'plyo'
];

/**
 * Type guard rather than a bare `CONDITIONING_CATEGORIES.includes(category)` at
 * call sites: `category` is the wide `ExerciseCategory`, so `.includes` can't
 * accept it without a cast, and a cast here would quietly keep compiling if
 * the two category lists ever drifted apart.
 */
export function isConditioningCategory(
	category: Exercise['category']
): category is ConditioningCategory {
	return CONDITIONING_CATEGORIES.includes(category as ConditioningCategory);
}

/** A note is coach→athlete text with nothing to perform — it is excluded
 *  entirely from day-completion / progress math (never numerator or denominator). */
export function countsTowardCompletion(exercise: Pick<Exercise, 'category'>): boolean {
	return exercise.category !== 'note';
}

/**
 * Whether one unit of work is done, which is the only place the per-category
 * completion rule lives. A weight set is done when the athlete entered a
 * weight; a conditioning unit is done when they tapped it. The `weight` check
 * is an explicit null/empty test rather than a truthiness test because
 * athlete_sets.weight is `text` and a logged `'0'` is a real entry.
 */
export function isSetEntryComplete(
	exercise: Pick<Exercise, 'category'>,
	set: Pick<Exercise['performed'][number], 'weight' | 'done'>
): boolean {
	if (exercise.category === 'weight') return set.weight !== null && set.weight !== '';
	return set.done;
}

/**
 * The length guard is load-bearing rather than defensive: an empty `performed`
 * list is reachable (a coach can save a weight exercise with its set count at
 * zero, and a note has no units at all), and `[].every(...)` is `true`, so
 * without it a set-less exercise would read as complete.
 */
export function exerciseComplete(exercise: Pick<Exercise, 'category' | 'performed'>): boolean {
	return (
		exercise.performed.length > 0 &&
		exercise.performed.every((s) => isSetEntryComplete(exercise, s))
	);
}

export type DayStatus = 'none' | 'exists' | 'in_progress' | 'complete';
