import { error } from '@sveltejs/kit';
import { getOrCreateExercise } from '$lib/server/exercises';
import { postHandler, json, type ApiContext } from '$lib/server/apiHandler';
import { dbList, dbMaybe, dbWrite, dbWriteReturning } from '$lib/server/db';
import {
	loadProgramDetail,
	loadWeekDetail,
	loadSessionDetail,
	checkAssignConflicts as checkAssignConflictsImpl,
	checkShiftConflicts as checkShiftConflictsImpl,
	resolveBreadcrumb
} from '$lib/server/programSchedule';

const RPC_ERROR_MESSAGE: Record<string, string> = {
	not_found: 'Program not found.',
	not_your_athlete: 'That athlete is not one of yours.',
	start_date_must_be_monday: 'The start date must be a Monday.',
	from_date_must_be_monday: 'The from date must be a Monday.',
	shift_weeks_must_not_be_zero: 'Enter a non-zero number of weeks to shift by.'
};

function rpcError(log: ApiContext['log'], name: string, message: string | undefined) {
	if (message && RPC_ERROR_MESSAGE[message]) {
		log.warn('rpc.rejected', { rpc: name, reason: message });
		return error(400, RPC_ERROR_MESSAGE[message]);
	}
	log.error('rpc.failed', new Error(message ?? 'unknown'), { rpc: name });
	return error(400, 'Request failed.');
}

export const POST = postHandler('/api/program', async ({ action, data, supabase, log }) => {
	switch (action) {
		case 'listPrograms': {
			const programs = await dbList(
				log,
				'program.list',
				supabase
					.from('programs')
					.select('id, name, description, cycles(id, weeks(id))')
					.order('name')
			);

			const summaries = programs.map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description,
				cycleCount: p.cycles?.length ?? 0,
				weekCount: (p.cycles ?? []).reduce((n, c) => n + (c.weeks?.length ?? 0), 0)
			}));

			return json({ data: summaries });
		}

		case 'getProgram': {
			const { programId } = data;
			const detail = await loadProgramDetail(supabase, programId as string, log);
			if (!detail) return error(404, 'Program not found.');
			return json({ data: detail });
		}

		case 'createProgram': {
			const { name, description } = data;
			const { data: claimsData } = await supabase.auth.getClaims();
			const coachId = claimsData?.claims?.sub;
			if (!coachId) return error(401, 'Unauthorized');

			const program = await dbWriteReturning(
				log,
				'program.create',
				supabase
					.from('programs')
					.insert({ coach_id: coachId, name, description: description ?? '' })
					.select('id')
					.single()
			);
			return json({ data: program });
		}

		case 'updateProgram': {
			const { programId, name, description } = data;
			await dbWrite(
				log,
				'program.update',
				supabase.from('programs').update({ name, description }).eq('id', programId)
			);
			return json({ data: { success: true } });
		}

		case 'deleteProgram': {
			const { programId } = data;
			await dbWrite(log, 'program.delete', supabase.from('programs').delete().eq('id', programId));
			return json({ data: { success: true } });
		}

		case 'addCycle': {
			const { programId, name, goal, colorKey } = data;

			const maxRow = await dbMaybe(
				log,
				'cycle.maxPosition',
				supabase
					.from('cycles')
					.select('position')
					.eq('program_id', programId)
					.order('position', { ascending: false })
					.limit(1)
					.maybeSingle()
			);

			const position = (maxRow?.position ?? -1) + 1;

			const cycle = await dbWriteReturning(
				log,
				'cycle.create',
				supabase
					.from('cycles')
					.insert({
						program_id: programId,
						name,
						goal: goal ?? '',
						color_key: colorKey ?? 'sky',
						position
					})
					.select('id')
					.single()
			);
			return json({ data: cycle });
		}

		case 'updateCycle': {
			const { cycleId, name, goal, colorKey } = data;
			await dbWrite(
				log,
				'cycle.update',
				supabase.from('cycles').update({ name, goal, color_key: colorKey }).eq('id', cycleId)
			);
			return json({ data: { success: true } });
		}

		case 'removeCycle': {
			const { cycleId } = data;
			await dbWrite(log, 'cycle.remove', supabase.from('cycles').delete().eq('id', cycleId));
			return json({ data: { success: true } });
		}

		case 'addWeek': {
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

		case 'duplicateWeek': {
			// Deep-copies sourceWeekId's sessions/exercises/sets into a new week
			// appended to the same cycle. Inserts are batched one level at a time
			// (all sessions, then all exercises, then all sets) rather than
			// row-by-row, so the client's optimistically-rendered copy reconciles
			// in ~a dozen round-trips instead of ~2 per exercise. Any failure
			// after the week row exists deletes it (cascading) — a half-built
			// week must never be left for the next getProgram to surface.
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

		case 'removeWeek': {
			const { weekId } = data;
			await dbWrite(log, 'week.remove', supabase.from('weeks').delete().eq('id', weekId));
			return json({ data: { success: true } });
		}

		case 'addSession': {
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

		case 'duplicateSession': {
			// Deep-copies one session's name + program_exercises + program_sets
			// onto another day — same nested-copy shape as duplicateWeek's inner
			// per-session loop, just invoked directly for a single day. The
			// destination may be in a different week or cycle of the coach's
			// programs; RLS (is_week_owner / is_session_owner) is what keeps it
			// to sessions the caller actually owns, either end.
			//
			// `replace` first deletes whatever session already sits on the
			// destination day (cascading to its own exercises/sets). Without it a
			// destination collision is refused — sessions has a unique
			// (week_id, day_number) index, and the caller's UI is expected to
			// have already confirmed the overwrite with the coach.
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

		case 'updateSession': {
			const { sessionId, name } = data;
			await dbWrite(
				log,
				'session.update',
				supabase.from('sessions').update({ name }).eq('id', sessionId)
			);
			return json({ data: { success: true } });
		}

		case 'removeSession': {
			const { sessionId } = data;
			await dbWrite(log, 'session.remove', supabase.from('sessions').delete().eq('id', sessionId));
			return json({ data: { success: true } });
		}

		case 'addProgramExercise': {
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
				await dbWrite(
					log,
					'programExercise.createSets',
					supabase.from('program_sets').insert(sets)
				);
			}

			return json({ data: programExercise });
		}

		case 'updateProgramExercise': {
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

		case 'removeProgramExercise': {
			const { programExerciseId } = data;
			await dbWrite(
				log,
				'programExercise.remove',
				supabase.from('program_exercises').delete().eq('id', programExerciseId)
			);
			return json({ data: { success: true } });
		}

		case 'reorderProgramExercise': {
			// Same shape of problem as api/workout's reorderExercise (reorder
			// within a sorted sibling list), against program_exercises.
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

		case 'checkAssignConflicts': {
			const { programId, athleteId, startDate } = data;
			const result = await checkAssignConflictsImpl(
				supabase,
				programId as string,
				athleteId as string,
				startDate as string,
				log
			);
			return json({ data: result });
		}

		case 'assignProgram': {
			const { programId, athleteId, startDate } = data;
			const { data: assignmentId, error: rpcErr } = await supabase.rpc('assign_program', {
				p_program_id: programId,
				p_athlete_id: athleteId,
				p_start_date: startDate
			});

			if (rpcErr) return rpcError(log, 'assign_program', rpcErr.message);
			log.info('assignProgram.ok', { athleteId, programId, assignmentId });
			return json({ data: { assignmentId } });
		}

		case 'checkShiftConflicts': {
			const { athleteId, fromDate, shiftWeeks } = data;
			const result = await checkShiftConflictsImpl(
				supabase,
				athleteId as string,
				fromDate as string,
				shiftWeeks as number,
				log
			);
			return json({ data: result });
		}

		case 'shiftSchedule': {
			const { athleteId, fromDate, shiftWeeks } = data;
			const { data: movedCount, error: rpcErr } = await supabase.rpc('shift_program_schedule', {
				p_athlete_id: athleteId,
				p_from_date: fromDate,
				p_shift_weeks: shiftWeeks
			});

			if (rpcErr) return rpcError(log, 'shift_program_schedule', rpcErr.message);
			log.info('shiftSchedule.ok', { athleteId, fromDate, shiftWeeks, movedCount });
			return json({ data: { movedCount } });
		}

		case 'getBreadcrumb': {
			const { athleteId, dateKey } = data;
			const breadcrumb = await resolveBreadcrumb(
				supabase,
				athleteId as string,
				dateKey as string,
				log
			);
			return json({ data: breadcrumb });
		}

		default:
			return error(400, `Unknown action: ${action}`);
	}
});
