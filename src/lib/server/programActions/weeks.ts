import { error } from '@sveltejs/kit';
import { json, type ApiContext } from '$lib/server/apiHandler';
import { dbList, dbMaybe, dbWrite, dbWriteReturning } from '$lib/server/db';
import { loadWeekDetail } from '$lib/server/programSchedule';

export async function addWeek({ data, supabase, log }: ApiContext) {
	const { cycleId } = data;

	const maxRow = await dbMaybe(
		log,
		'week.maxNumber',
		supabase
			.from('weeks')
			.select('week_number')
			.eq('cycle_id', cycleId)
			.order('week_number', { ascending: false })
			.limit(1)
			.maybeSingle()
	);

	const weekNumber = (maxRow?.week_number ?? 0) + 1;

	const week = await dbWriteReturning(
		log,
		'week.create',
		supabase
			.from('weeks')
			.insert({ cycle_id: cycleId, week_number: weekNumber })
			.select('id')
			.single()
	);
	return json({ data: week });
}

/**
 * Deep-copies sourceWeekId's sessions/exercises/sets into a new week appended
 * to the same cycle. Inserts are batched one level at a time (all sessions,
 * then all exercises, then all sets) rather than row-by-row, so the client's
 * optimistically-rendered copy reconciles in ~a dozen round-trips instead of
 * ~2 per exercise. Any failure after the week row exists deletes it
 * (cascading) — a half-built week must never be left for the next getProgram
 * to surface.
 */
export async function duplicateWeek({ data, supabase, log }: ApiContext) {
	const { sourceWeekId } = data;

	const sourceWeek = await dbMaybe(
		log,
		'week.duplicate.source',
		supabase.from('weeks').select('id, cycle_id').eq('id', sourceWeekId).maybeSingle()
	);

	if (!sourceWeek) return error(404, 'Week not found');

	const maxRow = await dbMaybe(
		log,
		'week.duplicate.maxNumber',
		supabase
			.from('weeks')
			.select('week_number')
			.eq('cycle_id', sourceWeek.cycle_id)
			.order('week_number', { ascending: false })
			.limit(1)
			.maybeSingle()
	);

	const weekNumber = (maxRow?.week_number ?? 0) + 1;

	const newWeek = await dbWriteReturning(
		log,
		'week.duplicate.create',
		supabase
			.from('weeks')
			.insert({ cycle_id: sourceWeek.cycle_id, week_number: weekNumber })
			.select('id')
			.single()
	);

	try {
		const sourceSessions = await dbList(
			log,
			'week.duplicate.sourceSessions',
			supabase
				.from('sessions')
				.select(
					'day_number, name, program_exercises(position, note, exercise_id, program_sets(set_number, target_reps))'
				)
				.eq('week_id', sourceWeekId)
		);

		if (sourceSessions.length > 0) {
			const newSessions = await dbList(
				log,
				'week.duplicate.insertSessions',
				supabase
					.from('sessions')
					.insert(
						sourceSessions.map((s) => ({
							week_id: newWeek.id,
							day_number: s.day_number,
							name: s.name
						}))
					)
					.select('id, day_number')
			);

			const sessionIdByDay = new Map(newSessions.map((s) => [s.day_number, s.id]));
			const allSets: {
				program_exercise_id: string;
				set_number: number;
				target_reps: number;
			}[] = [];

			for (const src of sourceSessions) {
				const newSessionId = sessionIdByDay.get(src.day_number);
				const pes = src.program_exercises ?? [];
				if (!newSessionId || pes.length === 0) continue;

				const newPes = await dbList(
					log,
					'week.duplicate.insertExercises',
					supabase
						.from('program_exercises')
						.insert(
							pes.map((pe) => ({
								session_id: newSessionId,
								exercise_id: pe.exercise_id,
								position: pe.position,
								note: pe.note
							}))
						)
						.select('id, position')
				);

				const peIdByPosition = new Map(newPes.map((pe) => [pe.position, pe.id]));
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
			}

			if (allSets.length > 0) {
				await dbWrite(
					log,
					'week.duplicate.insertSets',
					supabase.from('program_sets').insert(allSets)
				);
			}
		}
	} catch (e) {
		// A half-built week must never be left for the next getProgram to
		// surface — delete it (cascading). The throw is already logged by
		// the db helper; re-log with the rollback so the pair is obvious.
		log.error('week.duplicate.rollback', e, { newWeekId: newWeek.id });
		await supabase.from('weeks').delete().eq('id', newWeek.id);
		return error(500, 'Failed to duplicate week');
	}

	return json({ data: await loadWeekDetail(supabase, newWeek.id, log) });
}

export async function removeWeek({ data, supabase, log }: ApiContext) {
	const { weekId } = data;
	await dbWrite(log, 'week.remove', supabase.from('weeks').delete().eq('id', weekId));
	return json({ data: { success: true } });
}
