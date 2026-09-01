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

export type ExerciseCategory = 'warmup' | 'circuit' | 'plyo' | 'weight';

export interface Exercise {
	id?: string;
	category: ExerciseCategory;
	activity: string;
	plan: number[];
	performed: Prescription[];
	note: string;
	complete: boolean;
}

export interface Prescription {
	id?: string;
	weight?: string;
	reps?: number;
}

export type ColorKey = 'sky' | 'cream' | 'primary';

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
