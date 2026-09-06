import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrCreateExercise } from '$lib/server/exercises';
import { addDays, diffDays } from '$lib/dateKey';
import { postHandler, json } from '$lib/server/apiHandler';
import { dbList, dbMaybe, dbWrite, dbWriteReturning } from '$lib/server/db';
import type { Logger } from '$lib/server/log';

/**
 * Copies one athlete_workouts row (its exercises + sets) onto a destination
 * athlete+date, replacing whatever's there. Shared by pasteDay and pasteWeek —
 * a week-paste is just this run once per day that had source content.
 *
 * `session_id` is taken from the source — this is what lets a pasted day
 * resolve its program/cycle/week breadcrumb even for an athlete who was never
 * formally assigned anything. `program_assignment_id` is cleared on the dest
 * day: a hand-pasted day is no longer owned by an assignment, and keeping the
 * source's would make shift_program_schedule move the copy too.
 *
 * Add-then-delete, never delete-then-rebuild: the new exercises are inserted
 * onto the dest row alongside whatever's already there (athlete_exercises has
 * no uniqueness on position), and the day's old exercises are only removed
 * once the new ones are safely in. So a failure at any point before that final
 * delete leaves the dest day exactly as it was — a paste either takes fully or
 * not at all, it can never wipe the day. The brief window where the day holds
 * both sets of exercises is only observable by a coach mid-paste.
 *
 * Returns `false` only when the source day genuinely has nothing to copy.
 */
async function pasteWorkoutDay(
	supabase: SupabaseClient,
	log: Logger,
	sourceAthleteId: string,
	sourceDateKey: string,
	destAthleteId: string,
	destDateKey: string
): Promise<boolean> {
	const source = await dbMaybe(
		log,
		'paste.source',
		supabase
			.from('athlete_workouts')
			.select(
				'session_id, athlete_exercises(exercise_id, position, note, athlete_sets(set_number, target_reps))'
			)
			.eq('athlete_id', sourceAthleteId)
			.eq('scheduled_date', sourceDateKey)
			.maybeSingle()
	);

	if (!source) return false;

	// Ensure a dest row exists without disturbing anything on it yet (same
	// upsert shape as addExercise).
	const dest = await dbWriteReturning(
		log,
		'paste.ensureDest',
		supabase
			.from('athlete_workouts')
			.upsert(
				{ athlete_id: destAthleteId, scheduled_date: destDateKey },
				{ onConflict: 'athlete_id,scheduled_date' }
			)
			.select('id')
			.single()
	);

	// The dest day's current exercises — retired only after the new ones land.
	const stale = await dbList(
		log,
		'paste.staleExercises',
		supabase.from('athlete_exercises').select('id').eq('athlete_workout_id', dest.id)
	);

	const insertedIds: string[] = [];
	try {
		for (const ex of source.athlete_exercises ?? []) {
			const newEx = await dbWriteReturning(
				log,
				'paste.createExercise',
				supabase
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
					.single()
			);
			insertedIds.push(newEx.id);

			if (ex.athlete_sets?.length) {
				await dbWrite(
					log,
					'paste.createSets',
					supabase.from('athlete_sets').insert(
						ex.athlete_sets.map((s) => ({
							athlete_exercise_id: newEx.id,
							set_number: s.set_number,
							target_reps: s.target_reps
						}))
					)
				);
			}
		}
	} catch (e) {
		// Undo only what this paste added; the dest day's own content is
		// untouched, so bailing out here leaves the day as it was found.
		log.error('paste.rollback', e, { destAthleteId, destDateKey, destWorkoutId: dest.id });
		if (insertedIds.length) {
			const { error: rbErr } = await supabase
				.from('athlete_exercises')
				.delete()
				.in('id', insertedIds);
			if (rbErr) log.error('paste.rollbackFailed', rbErr, { destWorkoutId: dest.id, insertedIds });
		}
		throw e;
	}

	// New content is in — retire the old exercises and point the row at the
	// source's session.
	if (stale.length) {
		await dbWrite(
			log,
			'paste.removeStale',
			supabase
				.from('athlete_exercises')
				.delete()
				.in(
					'id',
					stale.map((r) => r.id)
				)
		);
	}
	await dbWrite(
		log,
		'paste.finalise',
		supabase
			.from('athlete_workouts')
			.update({ session_id: source.session_id, program_assignment_id: null })
			.eq('id', dest.id)
	);

	return true;
}

export const POST = postHandler('/api/workout', async ({ action, data, supabase, log }) => {
	switch (action) {
		case 'getDay': {
			const { athleteId, dateKey } = data;
			const workout = await dbMaybe(
				log,
				'workout.getDay',
				supabase
					.from('athlete_workouts')
					.select(
						'id, athlete_exercises(id, exercise_id, note, complete, position, exercises(name, category, video_url), athlete_sets(id, set_number, target_reps, weight, reps))'
					)
					.eq('athlete_id', athleteId)
					.eq('scheduled_date', dateKey)
					.maybeSingle()
			);

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
			const history = await dbList(
				log,
				'workout.exerciseHistory',
				supabase
					.from('athlete_workouts')
					.select(
						'scheduled_date, athlete_exercises!inner(id, complete, exercise_id, athlete_sets(set_number, target_reps, weight, reps))'
					)
					.eq('athlete_id', athleteId)
					.eq('athlete_exercises.exercise_id', exerciseId)
					.lt('scheduled_date', before)
					.order('scheduled_date', { ascending: false })
					.limit(12)
			);

			return json({ data: history });
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

			const workouts = await dbList(log, 'workout.getStatusMap', query);

			return json({ data: workouts });
		}

		case 'addExercise': {
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

		case 'updateExercise': {
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
				await dbWrite(
					log,
					'workout.updateExercise.sets',
					supabase.from('athlete_sets').insert(sets)
				);
			}

			return json({ data: { success: true } });
		}

		case 'removeExercise': {
			const { athleteExerciseId } = data;
			await dbWrite(
				log,
				'workout.removeExercise',
				supabase.from('athlete_exercises').delete().eq('id', athleteExerciseId)
			);
			return json({ data: { success: true } });
		}

		case 'reorderExercise': {
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

			// Pull the moving row out and splice it back in at the target slot,
			// then renumber positions 0..n-1. `position` has no unique constraint,
			// so a straight sequential rewrite is safe.
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

		case 'setExerciseComplete': {
			const { athleteExerciseId, complete } = data;
			await dbWrite(
				log,
				'workout.setComplete',
				supabase.from('athlete_exercises').update({ complete }).eq('id', athleteExerciseId)
			);
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
			await dbWrite(
				log,
				'workout.updateSet',
				supabase.from('athlete_sets').update(update).eq('id', setId)
			);
			return json({ data: { success: true } });
		}

		case 'pasteDay': {
			const { sourceAthleteId, sourceDateKey, destAthleteId, destDateKey } = data;
			const pasted = await pasteWorkoutDay(
				supabase,
				log,
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

			const sourceRows = await dbList(
				log,
				'pasteWeek.conflictCheck.source',
				supabase
					.from('athlete_workouts')
					.select('scheduled_date')
					.eq('athlete_id', sourceAthleteId)
					.gte('scheduled_date', sourceWeekStart)
					.lte('scheduled_date', addDays(sourceWeekStart, 6))
			);

			const destDates = sourceRows.map((r) =>
				addDays(destWeekStart, diffDays(sourceWeekStart, r.scheduled_date))
			);

			if (destDates.length === 0) return json({ data: { total: 0, conflicts: [] } });

			const existing = await dbList(
				log,
				'pasteWeek.conflictCheck.dest',
				supabase
					.from('athlete_workouts')
					.select('scheduled_date')
					.eq('athlete_id', destAthleteId)
					.in('scheduled_date', destDates)
			);

			const conflicts = existing.map((r) => r.scheduled_date as string);
			return json({ data: { total: destDates.length, conflicts } });
		}

		case 'pasteWeek': {
			const { sourceAthleteId, sourceWeekStart, destAthleteId, destWeekStart } = data;

			// Only the days that actually had source content are touched — a
			// rest day in the source week leaves whatever's at the matching
			// destination day untouched, rather than clearing it.
			const sourceRows = await dbList(
				log,
				'pasteWeek.source',
				supabase
					.from('athlete_workouts')
					.select('scheduled_date')
					.eq('athlete_id', sourceAthleteId)
					.gte('scheduled_date', sourceWeekStart)
					.lte('scheduled_date', addDays(sourceWeekStart, 6))
			);

			// Each day pastes independently: a day either takes the copy fully or
			// is left as it was (see pasteWorkoutDay). A failing day is logged and
			// reported back rather than silently dropped or aborting the rest.
			const pasted: string[] = [];
			const failed: string[] = [];
			for (const row of sourceRows) {
				const offset = diffDays(sourceWeekStart, row.scheduled_date);
				const destDateKey = addDays(destWeekStart, offset);
				try {
					await pasteWorkoutDay(
						supabase,
						log,
						sourceAthleteId,
						row.scheduled_date,
						destAthleteId,
						destDateKey
					);
					pasted.push(destDateKey);
				} catch (e) {
					log.error('pasteWeek.day', e, { sourceDate: row.scheduled_date, destDateKey });
					failed.push(destDateKey);
				}
			}

			log.info('pasteWeek.done', { pasted: pasted.length, failed: failed.length });
			return json({
				data: { pastedCount: pasted.length, failedCount: failed.length, failedDates: failed }
			});
		}

		case 'clearWeek': {
			const { athleteId, weekStart } = data;
			await dbWrite(
				log,
				'workout.clearWeek',
				supabase
					.from('athlete_workouts')
					.delete()
					.eq('athlete_id', athleteId)
					.gte('scheduled_date', weekStart)
					.lte('scheduled_date', addDays(weekStart, 6))
			);
			return json({ data: { success: true } });
		}

		default:
			return error(400, `Unknown action: ${action}`);
	}
});
