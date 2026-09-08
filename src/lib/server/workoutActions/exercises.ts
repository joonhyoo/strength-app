import { error } from '@sveltejs/kit';
import { getOrCreateExercise } from '$lib/server/exercises';
import { json, type ApiContext } from '$lib/server/apiHandler';
import { dbList, dbMaybe, dbWrite, dbWriteReturning } from '$lib/server/db';

export async function addExercise({ data, supabase, log }: ApiContext) {
	const { athleteId, dateKey, exercise } = data;

	const workout = await dbWriteReturning(
		log,
		'workout.addExercise.upsertDay',
		supabase
			.from('athlete_workouts')
			.upsert(
				{ athlete_id: athleteId, scheduled_date: dateKey },
				{ onConflict: 'athlete_id,scheduled_date' }
			)
			.select('id')
			.single()
	);

	const exerciseRecord = await getOrCreateExercise(
		supabase,
		exercise.activity,
		exercise.category,
		undefined,
		log
	);

	const maxPos = await dbMaybe(
		log,
		'workout.addExercise.maxPosition',
		supabase
			.from('athlete_exercises')
			.select('position')
			.eq('athlete_workout_id', workout.id)
			.order('position', { ascending: false })
			.limit(1)
			.maybeSingle()
	);

	const position = (maxPos?.position ?? -1) + 1;

	const athleteExercise = await dbWriteReturning(
		log,
		'workout.addExercise.insert',
		supabase
			.from('athlete_exercises')
			.insert({
				athlete_workout_id: workout.id,
				exercise_id: exerciseRecord.id,
				position,
				note: exercise.note,
				complete: exercise.complete
			})
			.select('id')
			.single()
	);

	if (exercise.category === 'weight' && exercise.plan.length > 0) {
		const sets = exercise.plan.map((targetReps: number, i: number) => ({
			athlete_exercise_id: athleteExercise.id,
			set_number: i + 1,
			target_reps: targetReps
		}));
		await dbWrite(log, 'workout.addExercise.sets', supabase.from('athlete_sets').insert(sets));
	}

	return json({ data: athleteExercise });
}

export async function updateExercise({ data, supabase, log }: ApiContext) {
	const { athleteExerciseId, exercise } = data;

	const exerciseRecord = await getOrCreateExercise(
		supabase,
		exercise.activity,
		exercise.category,
		undefined,
		log
	);

	await dbWrite(
		log,
		'workout.updateExercise.clearSets',
		supabase.from('athlete_sets').delete().eq('athlete_exercise_id', athleteExerciseId)
	);

	await dbWrite(
		log,
		'workout.updateExercise',
		supabase
			.from('athlete_exercises')
			.update({
				exercise_id: exerciseRecord.id,
				note: exercise.note,
				complete: exercise.complete
			})
			.eq('id', athleteExerciseId)
	);

	if (exercise.category === 'weight' && exercise.plan.length > 0) {
		const sets = exercise.plan.map((targetReps: number, i: number) => ({
			athlete_exercise_id: athleteExerciseId,
			set_number: i + 1,
			target_reps: targetReps
		}));
		await dbWrite(log, 'workout.updateExercise.sets', supabase.from('athlete_sets').insert(sets));
	}

	return json({ data: { success: true } });
}

export async function removeExercise({ data, supabase, log }: ApiContext) {
	const { athleteExerciseId } = data;
	await dbWrite(
		log,
		'workout.removeExercise',
		supabase.from('athlete_exercises').delete().eq('id', athleteExerciseId)
	);
	return json({ data: { success: true } });
}

export async function reorderExercise({ data, supabase, log }: ApiContext) {
	const { athleteExerciseId, toIndex } = data;

	const exercise = await dbMaybe(
		log,
		'workout.reorder.find',
		supabase
			.from('athlete_exercises')
			.select('id, athlete_workout_id')
			.eq('id', athleteExerciseId)
			.maybeSingle()
	);

	if (!exercise) return error(404, 'Exercise not found');

	const rows = await dbList(
		log,
		'workout.reorder.siblings',
		supabase
			.from('athlete_exercises')
			.select('id')
			.eq('athlete_workout_id', exercise.athlete_workout_id)
			.order('position')
	);

	// Pull the moving row out and splice it back in at the target slot, then
	// renumber positions 0..n-1. `position` has no unique constraint, so a
	// straight sequential rewrite is safe.
	const ids = rows.map((r) => r.id).filter((id) => id !== athleteExerciseId);
	const dest = Math.max(0, Math.min(toIndex, ids.length));
	ids.splice(dest, 0, athleteExerciseId);

	for (let k = 0; k < ids.length; k++) {
		if (rows[k]?.id === ids[k]) continue;
		await dbWrite(
			log,
			'workout.reorder.write',
			supabase.from('athlete_exercises').update({ position: k }).eq('id', ids[k])
		);
	}

	return json({ data: { success: true } });
}

export async function setExerciseComplete({ data, supabase, log }: ApiContext) {
	const { athleteExerciseId, complete } = data;
	await dbWrite(
		log,
		'workout.setComplete',
		supabase.from('athlete_exercises').update({ complete }).eq('id', athleteExerciseId)
	);
	return json({ data: { success: true } });
}

export async function updateSet({ data, supabase, log }: ApiContext) {
	const { setId, value } = data;
	// Narrow via `unknown`, not the `data`/`field` `any` above — `any` isn't
	// narrowed by an equality check the way `unknown` is.
	const field: unknown = data.field;
	if (field !== 'weight' && field !== 'reps') return error(400, 'Invalid field');
	// A computed key (`{ [field]: value }`) doesn't type-check against
	// athlete_sets' real column shape even once `field` is narrowed — TS
	// widens a computed key back to a string index signature rather than
	// distributing over the union. Branching avoids that entirely.
	const update = field === 'reps' ? { reps: value ? Number(value) : null } : { weight: value };
	await dbWrite(
		log,
		'workout.updateSet',
		supabase.from('athlete_sets').update(update).eq('id', setId)
	);
	return json({ data: { success: true } });
}
