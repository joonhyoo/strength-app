import { error } from '@sveltejs/kit';
import { json, type ApiContext } from '$lib/server/apiHandler';
import { dbList, dbMaybe, dbWrite, dbWriteReturning } from '$lib/server/db';
import { loadSessionDetail } from '$lib/server/programTree';

export async function addSession({ data, supabase, log }: ApiContext) {
	const { weekId, dayNumber, name } = data;
	const session = await dbWriteReturning(
		log,
		'session.create',
		supabase
			.from('sessions')
			.insert({ week_id: weekId, day_number: dayNumber, name })
			.select('id')
			.single()
	);
	return json({ data: session });
}

/**
 * Deep-copies one session's name + program_exercises + program_sets onto
 * another day — same nested-copy shape as duplicateWeek's inner per-session
 * loop, just invoked directly for a single day. The destination may be in a
 * different week or cycle of the coach's programs; RLS (is_week_owner /
 * is_session_owner) is what keeps it to sessions the caller actually owns,
 * either end.
 *
 * `replace` first deletes whatever session already sits on the destination
 * day (cascading to its own exercises/sets). Without it a destination
 * collision is refused — sessions has a unique (week_id, day_number) index,
 * and the caller's UI is expected to have already confirmed the overwrite
 * with the coach.
 */
export async function duplicateSession({ data, supabase, log }: ApiContext) {
	const { sourceSessionId, destWeekId, destDayNumber, replace } = data;

	const sourceSession = await dbMaybe(
		log,
		'session.duplicate.source',
		supabase
			.from('sessions')
			.select(
				'name, program_exercises(position, note, exercise_id, program_sets(set_number, target_reps))'
			)
			.eq('id', sourceSessionId)
			.maybeSingle()
	);

	if (!sourceSession) return error(404, 'Session not found');

	const existing = await dbMaybe(
		log,
		'session.duplicate.destCheck',
		supabase
			.from('sessions')
			.select('id')
			.eq('week_id', destWeekId)
			.eq('day_number', destDayNumber)
			.maybeSingle()
	);

	if (existing) {
		if (!replace) return error(409, 'That day already has a session.');
		await dbWrite(
			log,
			'session.duplicate.deleteExisting',
			supabase.from('sessions').delete().eq('id', existing.id)
		);
	}

	const newSession = await dbWriteReturning(
		log,
		'session.duplicate.create',
		supabase
			.from('sessions')
			.insert({ week_id: destWeekId, day_number: destDayNumber, name: sourceSession.name })
			.select('id')
			.single()
	);

	try {
		const pes = sourceSession.program_exercises ?? [];

		if (pes.length > 0) {
			const newPes = await dbList(
				log,
				'session.duplicate.insertExercises',
				supabase
					.from('program_exercises')
					.insert(
						pes.map((pe) => ({
							session_id: newSession.id,
							exercise_id: pe.exercise_id,
							position: pe.position,
							note: pe.note
						}))
					)
					.select('id, position')
			);

			const peIdByPosition = new Map(newPes.map((pe) => [pe.position, pe.id]));
			const allSets: {
				program_exercise_id: string;
				set_number: number;
				target_reps: number;
			}[] = [];

			for (const pe of pes) {
				const newPeId = peIdByPosition.get(pe.position);
				if (!newPeId) continue;
				for (const s of pe.program_sets ?? []) {
					allSets.push({
						program_exercise_id: newPeId,
						set_number: s.set_number,
						target_reps: s.target_reps
					});
				}
			}

			if (allSets.length > 0) {
				await dbWrite(
					log,
					'session.duplicate.insertSets',
					supabase.from('program_sets').insert(allSets)
				);
			}
		}
	} catch (e) {
		log.error('session.duplicate.rollback', e, { newSessionId: newSession.id });
		await supabase.from('sessions').delete().eq('id', newSession.id);
		return error(500, 'Failed to copy session');
	}

	return json({ data: await loadSessionDetail(supabase, newSession.id, log) });
}

export async function updateSession({ data, supabase, log }: ApiContext) {
	const { sessionId, name } = data;
	await dbWrite(
		log,
		'session.update',
		supabase.from('sessions').update({ name }).eq('id', sessionId)
	);
	return json({ data: { success: true } });
}

export async function removeSession({ data, supabase, log }: ApiContext) {
	const { sessionId } = data;
	await dbWrite(log, 'session.remove', supabase.from('sessions').delete().eq('id', sessionId));
	return json({ data: { success: true } });
}
