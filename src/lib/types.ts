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
export type ConditioningCategory = 'warmup' | 'circuit' | 'plyo';

export type ExerciseCategory = ConditioningCategory | 'weight' | 'note';

/**
 * One unit of work, and the athlete's log of it — the list every exercise is
 * made of, whether that list is 1 long or 3.
 *
 *  - `weight`: one per set, index-aligned to `Exercise.plan`, complete when a
 *    weight is entered. This is where the log lives.
 *  - conditioning (`warmup`/`circuit`/`plyo`): exactly one, whose only
 *    requirement is the athlete's own tap (`done`).
 *  - `note`: none. A note is coach-authored text with nothing to perform, and is
 *    excluded from completion math entirely.
 *
 * `done` is deliberately carried on every unit rather than on the exercise: a
 * per-exercise flag has to mean "the athlete tapped this" for conditioning while
 * meaning nothing at all for weight and note, which is the ambiguity
 * `isSetEntryComplete` in $lib/complete.ts now resolves in one place.
 */
export interface SetEntry {
	/** athlete_sets.id — absent on a set a coach has added but not yet saved. */
	id?: string;
	setNumber: number;
	/** null = not entered. athlete_sets.weight is `text`, so '0' is a real
	 *  entry and only a null (or '') means the athlete skipped this set. */
	weight: string | null;
	/** Actual reps; null until logged. The UI falls back to plan[i] meanwhile. */
	reps: number | null;
	/** Only read for a conditioning unit. A weight set is completed by its
	 *  `weight`, never by this. */
	done: boolean;
}

export interface Exercise {
	id?: string;
	/** The shared catalog row's id (exercises.id), not this athlete_exercises row.
	 *  Carried so the athlete's exercise modal can look up prior sessions of the
	 *  same lift. Optional: an older cached day (see workoutService) predates it
	 *  and self-heals on the next `getWorkoutDay`. */
	exerciseId?: string;
	category: ExerciseCategory;
	activity: string;
	/** Target reps per set. Empty for conditioning and note: a conditioning
	 *  exercise prescribes no reps, and its one unit's target_reps is null
	 *  (see athlete_sets in 20260929041935_set_entry_done.sql). */
	plan: number[];
	/** See SetEntry. Same length as `plan` for weight; length 1 for conditioning;
	 *  empty for a note. */
	performed: SetEntry[];
	note: string;
	/** Optional demo-video link from the catalog row (exercises.video_url). */
	videoUrl?: string;
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
 * its sets. ProgramTree stays lean (structure only) because it can be loaded
 * on hot paths (breadcrumb resolution, assignment-conflict previews);
 * ProgramDetail is only ever loaded once, for the Library editor's own
 * program view.
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
 *  program builder inserts and reuses across its edit and swap operations. */
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
	/** The session name for this day, e.g. "Upper A". */
	label: string;
}
