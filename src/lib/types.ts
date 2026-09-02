export type Role = 'coach' | 'athlete';

export interface User {
	name: string;
	role: Role;
	id: string;
	terms_accepted_at: string | null;
	coach_id: string | null;
	username: string | null;
}

export interface Athlete {
	id: string;
	name: string;
	email: string;
	coach_id: string;
}

// 'note' is a coach-authored text block the athlete reads — no sets, reps, or
// completion. It is deliberately NOT in CATEGORY_OPTIONS (src/lib/data/categories.ts):
// a note isn't a reusable catalog exercise, so it's never offered in the
// "pick / create an exercise" selects.
export type ExerciseCategory = 'warmup' | 'circuit' | 'plyo' | 'weight' | 'note';

export interface Exercise {
	id?: string;
	/** The shared catalog row's id (exercises.id), not this athlete_exercises row.
	 *  Carried so the athlete's exercise modal can look up prior sessions of the
	 *  same lift. Optional: an older cached day (see workoutService) predates it
	 *  and self-heals on the next `getWorkoutDay`. */
	exerciseId?: string;
	category: ExerciseCategory;
	activity: string;
	plan: number[];
	performed: Prescription[];
	note: string;
	complete: boolean;
	/** Optional demo-video link from the catalog row (exercises.video_url). */
	videoUrl?: string;
}

export interface Prescription {
	id?: string;
	weight?: string;
	reps?: number;
}

// Stored in cycles.color_key (CHECK-constrained — see
// 20260902000000_cycle_color_palette.sql). Each key maps to a theme token in
// src/lib/data/cycleColors.ts. 'sky' | 'cream' | 'primary' are the originals;
// the rest were added when the palette widened to 8.
export type ColorKey =
	| 'sky'
	| 'cream'
	| 'primary'
	| 'crimson'
	| 'amber'
	| 'lime'
	| 'teal'
	| 'violet';

export interface ProgramTree {
	id: string;
	name: string;
	description: string;
	cycles: {
		id: string;
		name: string;
		goal: string;
		colorKey: ColorKey;
		position: number;
		weeks: {
			id: string;
			weekNumber: number;
			sessions: { id: string; dayNumber: number; name: string }[];
		}[];
	}[];
}

/**
 * Same shape as ProgramTree, one level deeper — down to each exercise and
 * its sets. ProgramTree stays lean (structure only) because
 * resolveBreadcrumb's history-scanning fallback can load several programs'
 * trees per call; ProgramDetail is only ever loaded once, for the Library
 * editor's own program view.
 */
export interface ProgramExerciseDetail {
	id: string;
	activity: string;
	category: ExerciseCategory;
	note: string;
	/** Target reps per set, ordered by set_number. Empty for non-weight exercises. */
	plan: number[];
}

export interface ProgramDetail {
	id: string;
	name: string;
	description: string;
	cycles: {
		id: string;
		name: string;
		goal: string;
		colorKey: ColorKey;
		position: number;
		weeks: {
			id: string;
			weekNumber: number;
			sessions: {
				id: string;
				dayNumber: number;
				name: string;
				exercises: ProgramExerciseDetail[];
			}[];
		}[];
	}[];
}

/** One cycle / week / session out of a ProgramDetail tree — the units the
 *  program builder inserts optimistically and reconciles against the server. */
export type CycleDetail = ProgramDetail['cycles'][number];
export type WeekDetail = CycleDetail['weeks'][number];
export type SessionDetail = WeekDetail['sessions'][number];

export interface AssignmentDate {
	dateKey: string;
	sessionId: string;
	sessionName: string;
	weekRank: number;
}

export interface Breadcrumb {
	programName: string;
	cycleName: string;
	colorKey: ColorKey;
	weekOfTotal: number;
	totalWeeks: number;
	label: string;
	isComplete: boolean;
}
