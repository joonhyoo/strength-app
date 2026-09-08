import type { SupabaseClient } from '@supabase/supabase-js';
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
export async function pasteWorkoutDay(
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
