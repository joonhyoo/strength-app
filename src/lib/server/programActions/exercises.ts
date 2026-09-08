import { error } from '@sveltejs/kit';
import { getOrCreateExercise } from '$lib/server/exercises';
import { json, type ApiContext } from '$lib/server/apiHandler';
import { dbList, dbMaybe, dbWrite, dbWriteReturning } from '$lib/server/db';

export async function addProgramExercise({ data, supabase, log }: ApiContext) {
	const { sessionId, exercise } = data;

	const exerciseRecord = await getOrCreateExercise(
		supabase,
		exercise.activity,
		exercise.category,
		undefined,
		log
	);

	const maxRow = await dbMaybe(
		log,
		'programExercise.maxPosition',
		supabase
			.from('program_exercises')
			.select('position')
			.eq('session_id', sessionId)
			.order('position', { ascending: false })
			.limit(1)
			.maybeSingle()
	);

	const position = (maxRow?.position ?? -1) + 1;

	const programExercise = await dbWriteReturning(
		log,
		'programExercise.create',
		supabase
			.from('program_exercises')
			.insert({
				session_id: sessionId,
				exercise_id: exerciseRecord.id,
				position,
				note: exercise.note ?? ''
			})
			.select('id')
			.single()
	);

	if (exercise.category === 'weight' && exercise.plan?.length > 0) {
		const sets = exercise.plan.map((targetReps: number, i: number) => ({
			program_exercise_id: programExercise.id,
			set_number: i + 1,
			target_reps: targetReps
		}));
		await dbWrite(log, 'programExercise.createSets', supabase.from('program_sets').insert(sets));
	}

	return json({ data: programExercise });
}

export async function updateProgramExercise({ data, supabase, log }: ApiContext) {
	const { programExerciseId, exercise } = data;

	const exerciseRecord = await getOrCreateExercise(
		supabase,
		exercise.activity,
		exercise.category,
		undefined,
		log
	);

	await dbWrite(
		log,
		'programExercise.update.clearSets',
		supabase.from('program_sets').delete().eq('program_exercise_id', programExerciseId)
	);

	await dbWrite(
		log,
		'programExercise.update',
		supabase
			.from('program_exercises')
			.update({ exercise_id: exerciseRecord.id, note: exercise.note ?? '' })
			.eq('id', programExerciseId)
	);

	if (exercise.category === 'weight' && exercise.plan?.length > 0) {
		const sets = exercise.plan.map((targetReps: number, i: number) => ({
			program_exercise_id: programExerciseId,
			set_number: i + 1,
			target_reps: targetReps
		}));
		await dbWrite(
			log,
			'programExercise.update.insertSets',
			supabase.from('program_sets').insert(sets)
		);
	}

	return json({ data: { success: true } });
}

export async function removeProgramExercise({ data, supabase, log }: ApiContext) {
	const { programExerciseId } = data;
	await dbWrite(
		log,
		'programExercise.remove',
		supabase.from('program_exercises').delete().eq('id', programExerciseId)
	);
	return json({ data: { success: true } });
}

/** Same shape of problem as api/workout's reorderExercise (reorder within a
 *  sorted sibling list), against program_exercises. */
export async function reorderProgramExercise({ data, supabase, log }: ApiContext) {
	const { programExerciseId, toIndex } = data;

	const exercise = await dbMaybe(
		log,
		'programExercise.reorder.find',
		supabase
			.from('program_exercises')
			.select('id, session_id')
			.eq('id', programExerciseId)
			.maybeSingle()
	);

	if (!exercise) return error(404, 'Exercise not found');

	const rows = await dbList(
		log,
		'programExercise.reorder.siblings',
		supabase
			.from('program_exercises')
			.select('id')
			.eq('session_id', exercise.session_id)
			.order('position')
	);

	const ids = rows.map((r) => r.id).filter((id) => id !== programExerciseId);
	const dest = Math.max(0, Math.min(toIndex, ids.length));
	ids.splice(dest, 0, programExerciseId);

	for (let k = 0; k < ids.length; k++) {
		if (rows[k]?.id === ids[k]) continue;
		await dbWrite(
			log,
			'programExercise.reorder.write',
			supabase.from('program_exercises').update({ position: k }).eq('id', ids[k])
		);
	}

	return json({ data: { success: true } });
}
