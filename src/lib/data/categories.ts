import type { ExerciseCategory } from '$lib/types';

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
	warmup: 'Warmup',
	circuit: 'Circuit',
	plyo: 'Plyo',
	weight: 'Weight',
	note: 'Note'
};

// The categories offered when picking or creating a catalog exercise. 'note' is
// intentionally excluded — a note is authored inline (its own "Add note" flow),
// never a reusable catalog entry, so it must not appear in these selects or in
// the catalog's own category grouping.
export const CATEGORY_OPTIONS: ExerciseCategory[] = ['warmup', 'circuit', 'plyo', 'weight'];
