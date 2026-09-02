import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateExercise } from '$lib/server/exercises';
import { addDays, diffDays } from '$lib/server/programSchedule';

/**
 * Copies one athlete_workouts row (with its exercises/sets) onto a
 * destination athlete+date, replacing whatever's already there. Shared by
 * pasteDay and pasteWeek — a week-paste is just this run once per day that
 * had source content.
 *
 * `session_id` carries over (this is what lets a pasted day still resolve
 * its program/cycle/week breadcrumb even for an athlete who was never
 * formally assigned anything), but `program_assignment_id` deliberately
 * does not — that column scopes shift_program_schedule's moving set, and
 * copying it onto a different athlete's row would make shifting the
 * source's assignment incorrectly also move the pasted copy.
 */
async function pasteWorkoutDay(
	supabase: import('@supabase/supabase-js').SupabaseClient,
	sourceAthleteId: string,
	sourceDateKey: string,
	destAthleteId: string,
	destDateKey: string
): Promise<boolean> {
	const { data: source } = await supabase
		.from('athlete_workouts')
		.select(
			'session_id, athlete_exercises(exercise_id, position, note, athlete_sets(set_number, target_reps))'
		)
		.eq('athlete_id', sourceAthleteId)
		.eq('scheduled_date', sourceDateKey)
		.maybeSingle();

	if (!source) return false;

	await supabase
		.from('athlete_workouts')
		.delete()
		.eq('athlete_id', destAthleteId)
		.eq('scheduled_date', destDateKey);

	const { data: dest, error: insertErr } = await supabase
		.from('athlete_workouts')
		.insert({
			athlete_id: destAthleteId,
			scheduled_date: destDateKey,
			session_id: source.session_id
		})
		.select('id')
		.single();

	if (insertErr || !dest) return false;

	for (const ex of source.athlete_exercises ?? []) {
		const { data: newEx } = await supabase
			.from('athlete_exercises')
			.insert({
				athlete_workout_id: dest.id,
				exercise_id: ex.exercise_id,
				position: ex.position,
				note: ex.note,
				// A pasted day schedules a plan, not a completed log — completion
				// and any actually-performed weight/reps never carry over.
				complete: false
			})
			.select('id')
			.single();

		if (newEx && ex.athlete_sets?.length) {
			await supabase.from('athlete_sets').insert(
				ex.athlete_sets.map((s) => ({
					athlete_exercise_id: newEx.id,
					set_number: s.set_number,
					target_reps: s.target_reps
				}))
			);
		}
	}

	return true;
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
					'id, athlete_exercises(id, exercise_id, note, complete, position, exercises(name, category), athlete_sets(id, set_number, target_reps, weight, reps))'
				)
				.eq('athlete_id', athleteId)
				.eq('scheduled_date', dateKey)
				.maybeSingle();

			return json({ data: workout ?? null });
		}

		case 'exerciseHistory': {
			// Prior sessions of one catalog exercise for one athlete, most recent
			// first. `!inner` + the embedded exercise_id filter keeps this to
			// workout days that actually contained the lift; the caller (the
			// athlete's exercise modal) then drops any session with nothing
			// logged. Bounded to a recent window — this is a "what did I do last
			// time" glance, not a full training log.
			const { athleteId, exerciseId, before } = data;
			const { data: history } = await supabase
				.from('athlete_workouts')
				.select(
					'scheduled_date, athlete_exercises!inner(id, complete, exercise_id, athlete_sets(set_number, target_reps, weight, reps))'
				)
				.eq('athlete_id', athleteId)
				.eq('athlete_exercises.exercise_id', exerciseId)
				.lt('scheduled_date', before)
				.order('scheduled_date', { ascending: false })
				.limit(12);

			return json({ data: history ?? [] });
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

			const exerciseRecord = await getOrCreateExercise(
				supabase,
				exercise.activity,
				exercise.category
			);
			if (!exerciseRecord) return error(500, 'Failed to create exercise');

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
					exercise_id: exerciseRecord.id,
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

			const exerciseRecord = await getOrCreateExercise(
				supabase,
				exercise.activity,
				exercise.category
			);
			if (!exerciseRecord) return error(500, 'Failed to create exercise');

			// Delete old sets
			await supabase.from('athlete_sets').delete().eq('athlete_exercise_id', athleteExerciseId);

			// Update exercise
			const { error: updateErr } = await supabase
				.from('athlete_exercises')
				.update({
					exercise_id: exerciseRecord.id,
					note: exercise.note,
					complete: exercise.complete
				})
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
			const { setId, value } = data;
			// Narrow via `unknown`, not the `data`/`field` `any` above — `any`
			// isn't narrowed by an equality check the way `unknown` is.
			const field: unknown = data.field;
			if (field !== 'weight' && field !== 'reps') return error(400, 'Invalid field');
			// A computed key (`{ [field]: value }`) doesn't type-check against
			// athlete_sets' real column shape even once `field` is narrowed —
			// TS widens a computed key back to a string index signature rather
			// than distributing over the union. Branching avoids that entirely.
			const update = field === 'reps' ? { reps: value ? Number(value) : null } : { weight: value };
			const { error: updateErr } = await supabase
				.from('athlete_sets')
				.update(update)
				.eq('id', setId);

			if (updateErr) return error(500, 'Failed to update set');
			return json({ data: { success: true } });
		}

		case 'pasteDay': {
			const { sourceAthleteId, sourceDateKey, destAthleteId, destDateKey } = data;
			const pasted = await pasteWorkoutDay(
				supabase,
				sourceAthleteId,
				sourceDateKey,
				destAthleteId,
				destDateKey
			);

			if (!pasted) return error(404, 'Nothing to paste — that day is no longer scheduled.');
			return json({ data: { success: true } });
		}

		case 'checkPasteWeekConflicts': {
			const { sourceAthleteId, sourceWeekStart, destAthleteId, destWeekStart } = data;

			const { data: sourceRows } = await supabase
				.from('athlete_workouts')
				.select('scheduled_date')
				.eq('athlete_id', sourceAthleteId)
				.gte('scheduled_date', sourceWeekStart)
				.lte('scheduled_date', addDays(sourceWeekStart, 6));

			const destDates = (sourceRows ?? []).map((r) =>
				addDays(destWeekStart, diffDays(sourceWeekStart, r.scheduled_date))
			);

			if (destDates.length === 0) return json({ data: { total: 0, conflicts: [] } });

			const { data: existing } = await supabase
				.from('athlete_workouts')
				.select('scheduled_date')
				.eq('athlete_id', destAthleteId)
				.in('scheduled_date', destDates);

			const conflicts = (existing ?? []).map((r) => r.scheduled_date as string);
			return json({ data: { total: destDates.length, conflicts } });
		}

		case 'pasteWeek': {
			const { sourceAthleteId, sourceWeekStart, destAthleteId, destWeekStart } = data;

			// Only the days that actually had source content are touched — a
			// rest day in the source week leaves whatever's at the matching
			// destination day untouched, rather than clearing it.
			const { data: sourceRows } = await supabase
				.from('athlete_workouts')
				.select('scheduled_date')
				.eq('athlete_id', sourceAthleteId)
				.gte('scheduled_date', sourceWeekStart)
				.lte('scheduled_date', addDays(sourceWeekStart, 6));

			let pastedCount = 0;
			for (const row of sourceRows ?? []) {
				const offset = diffDays(sourceWeekStart, row.scheduled_date);
				const destDateKey = addDays(destWeekStart, offset);
				const pasted = await pasteWorkoutDay(
					supabase,
					sourceAthleteId,
					row.scheduled_date,
					destAthleteId,
					destDateKey
				);
				if (pasted) pastedCount++;
			}

			return json({ data: { pastedCount } });
		}

		case 'clearWeek': {
			const { athleteId, weekStart } = data;
			const { error: delErr } = await supabase
				.from('athlete_workouts')
				.delete()
				.eq('athlete_id', athleteId)
				.gte('scheduled_date', weekStart)
				.lte('scheduled_date', addDays(weekStart, 6));

			if (delErr) return error(500, 'Failed to clear week');
			return json({ data: { success: true } });
		}

		default:
			return error(400, `Unknown action: ${action}`);
	}
};
