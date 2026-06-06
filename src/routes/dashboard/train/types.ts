export type ExerciseCategory = 'warmup' | 'plyo' | 'weight';

export interface Exercise {
	category: ExerciseCategory;
	title: string;
	prescription: number[];
}
