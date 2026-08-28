import type { ExerciseCategory } from '$lib/types';

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
	warmup: 'Warmup',
	circuit: 'Circuit',
	plyo: 'Plyo',
	weight: 'Weight'
};

export const CATEGORY_OPTIONS: ExerciseCategory[] = ['warmup', 'circuit', 'plyo', 'weight'];
