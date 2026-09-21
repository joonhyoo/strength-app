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

/**
 * Edits a scheduled exercise's lift, note, and target plan. The athlete's own
 * log lives on the same rows — `athlete_sets.weight` / `.reps`, and
 * `athlete_exercises.complete` — so this must never rewrite them wholesale:
 *  - `complete` is not written at all (only the athlete toggles it, and the
 *    coach's edit form holds a snapshot that can be stale by the time it's saved);
 *  - sets are diffed against the new plan instead of deleted and re-inserted, so
 *    editing just a note (or adding a set) keeps what was already logged.
 * Swapping in a *different* catalog exercise is the exception: whatever was
 * logged belonged to the old lift, so its sets start afresh.
 */
export async function updateExercise({ data, supabase, log }: ApiContext) {
	const { athleteExerciseId, exercise } = data;

	const current = await dbMaybe(
		log,
		'workout.updateExercise.find',
		supabase
			.from('athlete_exercises')
			.select('exercise_id')
			.eq('id', athleteExerciseId)
			.maybeSingle()
	);
	if (!current) return error(404, 'Exercise not found');

	const exerciseRecord = await getOrCreateExercise(
		supabase,
		exercise.activity,
		exercise.category,
		undefined,
		log
	);

	await dbWrite(
		log,
		'workout.updateExercise',
		supabase
			.from('athlete_exercises')
			.update({ exercise_id: exerciseRecord.id, note: exercise.note })
			.eq('id', athleteExerciseId)
	);

	if (current.exercise_id !== exerciseRecord.id) {
		await dbWrite(
			log,
			'workout.updateExercise.clearSets',
			supabase.from('athlete_sets').delete().eq('athlete_exercise_id', athleteExerciseId)
		);
	}

	const plan: number[] = exercise.category === 'weight' ? exercise.plan : [];
	const existing = await dbList(
		log,
		'workout.updateExercise.sets',
		supabase
			.from('athlete_sets')
			.select('id, set_number, target_reps')
			.eq('athlete_exercise_id', athleteExerciseId)
			.order('set_number')
	);

	// Retarget the sets that stay, drop any beyond the new plan, append new ones.
	for (const [i, row] of existing.slice(0, plan.length).entries()) {
		if (row.target_reps === plan[i]) continue;
		await dbWrite(
			log,
			'workout.updateExercise.retargetSet',
			supabase.from('athlete_sets').update({ target_reps: plan[i] }).eq('id', row.id)
		);
	}

	const surplus = existing.slice(plan.length).map((row) => row.id);
	if (surplus.length > 0) {
		await dbWrite(
			log,
			'workout.updateExercise.dropSets',
			supabase.from('athlete_sets').delete().in('id', surplus)
		);
	}

	const lastSetNumber = existing.at(-1)?.set_number ?? 0;
	const added = plan.slice(existing.length).map((targetReps, i) => ({
		athlete_exercise_id: athleteExerciseId,
		set_number: lastSetNumber + i + 1,
		target_reps: targetReps
	}));
	if (added.length > 0) {
		await dbWrite(
			log,
			'workout.updateExercise.addSets',
			supabase.from('athlete_sets').insert(added)
		);
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
