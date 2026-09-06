import type { Exercise, ExerciseCategory } from '$lib/types';
import { postApi } from './api';

/** Every `/api/workout` call, normalised to `{ ok, data | error }` — see `postApi`. */
const postWorkout = (action: string, data: Record<string, unknown>) =>
	postApi('/api/workout', action, data);

export async function addExerciseToDay(athleteId: string, dateKey: string, exercise: Exercise) {
	const category: ExerciseCategory = exercise.category;
	const isWeight = category === 'weight';

	return postWorkout('addExercise', {
		athleteId,
		dateKey,
		exercise: {
			activity: exercise.activity,
			category,
			note: exercise.note,
			complete: exercise.complete,
			plan: isWeight ? (exercise.plan.length > 0 ? exercise.plan : Array(3).fill(5)) : [],
			performed: exercise.performed
		}
	});
}

export async function updateExercise(athleteExerciseId: string, exercise: Exercise) {
	return postWorkout('updateExercise', {
		athleteExerciseId,
		exercise: {
			activity: exercise.activity,
			category: exercise.category,
			note: exercise.note,
			complete: exercise.complete,
			plan:
				exercise.category === 'weight'
					? exercise.plan.length > 0
						? exercise.plan
						: Array(exercise.performed.length || 3).fill(5)
					: [],
			performed: exercise.performed
		}
	});
}

export async function removeExercise(id: string) {
	return postWorkout('removeExercise', { athleteExerciseId: id });
}

export async function reorderExercise(id: string, toIndex: number) {
	return postWorkout('reorderExercise', { athleteExerciseId: id, toIndex });
}

export async function setExerciseComplete(id: string, complete: boolean) {
	return postWorkout('setExerciseComplete', { athleteExerciseId: id, complete });
}

export async function updateSet(setId: string, field: 'weight' | 'reps', value: string) {
	return postWorkout('updateSet', { setId, field, value });
}

export async function pasteDay(
	sourceAthleteId: string,
	sourceDateKey: string,
	destAthleteId: string,
	destDateKey: string
) {
	return postWorkout('pasteDay', { sourceAthleteId, sourceDateKey, destAthleteId, destDateKey });
}

export async function checkPasteWeekConflicts(
	sourceAthleteId: string,
	sourceWeekStart: string,
	destAthleteId: string,
	destWeekStart: string
): Promise<{ total: number; conflicts: string[] }> {
	const res = await postWorkout('checkPasteWeekConflicts', {
		sourceAthleteId,
		sourceWeekStart,
		destAthleteId,
		destWeekStart
	});
	return res.ok
		? ((res.data as { total: number; conflicts: string[] }) ?? { total: 0, conflicts: [] })
		: { total: 0, conflicts: [] };
}

export async function pasteWeek(
	sourceAthleteId: string,
	sourceWeekStart: string,
	destAthleteId: string,
	destWeekStart: string
) {
	return postWorkout('pasteWeek', {
		sourceAthleteId,
		sourceWeekStart,
		destAthleteId,
		destWeekStart
	});
}

export async function clearWeek(athleteId: string, weekStart: string) {
	return postWorkout('clearWeek', { athleteId, weekStart });
}
