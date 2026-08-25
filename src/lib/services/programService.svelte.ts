import type { Exercise, ExerciseCategory } from '$lib/types';

async function postWorkout(action: string, data: Record<string, unknown>) {
	const res = await fetch('/api/workout', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action, data })
	});
	return res.json();
}

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

export async function moveExercise(id: string, direction: 'up' | 'down') {
	return postWorkout('moveExercise', { athleteExerciseId: id, direction });
}

export async function setExerciseComplete(id: string, complete: boolean) {
	return postWorkout('setExerciseComplete', { athleteExerciseId: id, complete });
}

export async function updateSet(setId: string, field: 'weight' | 'reps', value: string) {
	return postWorkout('updateSet', { setId, field, value });
}
