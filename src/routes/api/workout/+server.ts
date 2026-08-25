import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Look up an exercise definition by name, creating it if it doesn't exist yet. */
async function getOrCreateExerciseId(
	supabase: SupabaseClient,
	name: string,
	category: string
): Promise<string | null> {
	const { data: existing } = await supabase
		.from('exercises')
		.select('id')
		.eq('name', name)
		.maybeSingle();

	if (existing) return existing.id;

	const { data: created } = await supabase
		.from('exercises')
		.insert({ name, category })
		.select('id')
		.single();

	return created?.id ?? null;
}

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
	const body = await request.json();
	const { action, data } = body;

	switch (action) {
		case 'getDay': {
			const { athleteId, dateKey } = data;
			const { data: workout } = await supabase
				.from('athlete_workouts')
				.select(
					'id, athlete_exercises(id, note, complete, position, exercises(name, category), athlete_sets(id, set_number, target_reps, weight, reps))'
				)
				.eq('athlete_id', athleteId)
				.eq('scheduled_date', dateKey)
				.maybeSingle();

			return json({ data: workout ?? null });
		}

		case 'getStatusMap': {
			const { athleteId, from, to } = data;
			let query = supabase
				.from('athlete_workouts')
				.select(
					'scheduled_date, athlete_exercises(id, complete, exercises(category), athlete_sets(weight))'
				)
				.eq('athlete_id', athleteId);

			if (from) query = query.gte('scheduled_date', from);
			if (to) query = query.lte('scheduled_date', to);

			const { data: workouts } = await query;

			return json({ data: workouts ?? [] });
		}

		case 'addExercise': {
			const { athleteId, dateKey, exercise } = data;

			// Upsert workout
			const { data: workout, error: workoutErr } = await supabase
				.from('athlete_workouts')
				.upsert(
					{ athlete_id: athleteId, scheduled_date: dateKey },
					{ onConflict: 'athlete_id,scheduled_date' }
				)
				.select('id')
				.single();

			if (workoutErr || !workout) return error(500, 'Failed to create workout');

			const exerciseId = await getOrCreateExerciseId(
				supabase,
				exercise.activity,
				exercise.category
			);
			if (!exerciseId) return error(500, 'Failed to create exercise');

			// Get max position
			const { data: maxPos } = await supabase
				.from('athlete_exercises')
				.select('position')
				.eq('athlete_workout_id', workout.id)
				.order('position', { ascending: false })
				.limit(1)
				.maybeSingle();

			const position = (maxPos?.position ?? -1) + 1;

			// Insert exercise
			const { data: athleteExercise, error: exErr } = await supabase
				.from('athlete_exercises')
				.insert({
					athlete_workout_id: workout.id,
					exercise_id: exerciseId,
					position,
					note: exercise.note,
					complete: exercise.complete
				})
				.select('id')
				.single();

			if (exErr || !athleteExercise) return error(500, 'Failed to add exercise');

			// Insert sets if weight exercise
			if (exercise.category === 'weight' && exercise.plan.length > 0) {
				const sets = exercise.plan.map((targetReps: number, i: number) => ({
					athlete_exercise_id: athleteExercise.id,
					set_number: i + 1,
					target_reps: targetReps
				}));
				await supabase.from('athlete_sets').insert(sets);
			}

			return json({ data: athleteExercise });
		}

		case 'updateExercise': {
			const { athleteExerciseId, exercise } = data;

			const exerciseId = await getOrCreateExerciseId(
				supabase,
				exercise.activity,
				exercise.category
			);
			if (!exerciseId) return error(500, 'Failed to create exercise');

			// Delete old sets
			await supabase.from('athlete_sets').delete().eq('athlete_exercise_id', athleteExerciseId);

			// Update exercise
			const { error: updateErr } = await supabase
				.from('athlete_exercises')
				.update({ exercise_id: exerciseId, note: exercise.note, complete: exercise.complete })
				.eq('id', athleteExerciseId);

			if (updateErr) return error(500, 'Failed to update exercise');

			// Insert new sets if weight exercise
			if (exercise.category === 'weight' && exercise.plan.length > 0) {
				const sets = exercise.plan.map((targetReps: number, i: number) => ({
					athlete_exercise_id: athleteExerciseId,
					set_number: i + 1,
					target_reps: targetReps
				}));
				await supabase.from('athlete_sets').insert(sets);
			}

			return json({ data: { success: true } });
		}

		case 'removeExercise': {
			const { athleteExerciseId } = data;
			const { error: delErr } = await supabase
				.from('athlete_exercises')
				.delete()
				.eq('id', athleteExerciseId);

			if (delErr) return error(500, 'Failed to remove exercise');
			return json({ data: { success: true } });
		}

		case 'moveExercise': {
			const { athleteExerciseId, direction } = data;

			// Get the exercise and its workout
			const { data: exercise } = await supabase
				.from('athlete_exercises')
				.select('id, position, athlete_workout_id')
				.eq('id', athleteExerciseId)
				.single();

			if (!exercise) return error(404, 'Exercise not found');

			const { data: rows } = await supabase
				.from('athlete_exercises')
				.select('id, position')
				.eq('athlete_workout_id', exercise.athlete_workout_id)
				.order('position');

			if (!rows) return error(500, 'Failed to fetch exercises');

			const index = rows.findIndex((r) => r.id === athleteExerciseId);
			const neighbor = direction === 'up' ? rows[index - 1] : rows[index + 1];
			if (!neighbor) return json({ data: { success: true } });

			// Two-phase swap via temp position
			await supabase.from('athlete_exercises').update({ position: -1 }).eq('id', exercise.id);

			await supabase
				.from('athlete_exercises')
				.update({ position: exercise.position })
				.eq('id', neighbor.id);

			await supabase
				.from('athlete_exercises')
				.update({ position: neighbor.position })
				.eq('id', exercise.id);

			return json({ data: { success: true } });
		}

		case 'setExerciseComplete': {
			const { athleteExerciseId, complete } = data;
			const { error: updateErr } = await supabase
				.from('athlete_exercises')
				.update({ complete })
				.eq('id', athleteExerciseId);

			if (updateErr) return error(500, 'Failed to update exercise');
			return json({ data: { success: true } });
		}

		case 'updateSet': {
			const { setId, field, value } = data;
			const update: Record<string, unknown> = {
				[field]: field === 'reps' ? (value ? Number(value) : null) : value
			};
			const { error: updateErr } = await supabase
				.from('athlete_sets')
				.update(update)
				.eq('id', setId);

			if (updateErr) return error(500, 'Failed to update set');
			return json({ data: { success: true } });
		}

		default:
			return error(400, `Unknown action: ${action}`);
	}
};
