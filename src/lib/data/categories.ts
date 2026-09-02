import FireLineIcon from '@iconify-svelte/mingcute/fire-line';
import HeartbeatLineIcon from '@iconify-svelte/mingcute/heartbeat-line';
import BarbellLineIcon from '@iconify-svelte/mingcute/barbell-line';
import ReapeatFillIcon from '@iconify-svelte/mingcute/repeat-fill';
import Message3LineIcon from '@iconify-svelte/mingcute/message-3-line';
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

// Per-category icon + text color, shared by CategoryIcon.svelte (scheduled-exercise
// badges) and the exercise catalog list (compact inline row icons).
export const CATEGORY_ICON: Record<ExerciseCategory, { icon: typeof FireLineIcon; color: string }> =
	{
		warmup: { icon: FireLineIcon, color: 'text-danger' },
		circuit: { icon: ReapeatFillIcon, color: 'text-lime' },
		plyo: { icon: HeartbeatLineIcon, color: 'text-sky' },
		weight: { icon: BarbellLineIcon, color: 'text-primary' },
		note: { icon: Message3LineIcon, color: 'text-cream' }
	};
