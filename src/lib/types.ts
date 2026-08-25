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
