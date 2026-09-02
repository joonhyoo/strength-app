import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateExercise } from '$lib/server/exercises';
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

function rpcError(message: string | undefined) {
	return error(
		400,
		message && RPC_ERROR_MESSAGE[message] ? RPC_ERROR_MESSAGE[message] : 'Request failed.'
	);
}

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
	const body = await request.json();
	const { action, data } = body;

	switch (action) {
		case 'listPrograms': {
			const { data: programs } = await supabase
				.from('programs')
				.select('id, name, description, cycles(id, weeks(id))')
				.order('name');

			const summaries = (programs ?? []).map((p) => ({
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
			const detail = await loadProgramDetail(supabase, programId);
			if (!detail) return error(404, 'Program not found.');
			return json({ data: detail });
		}

		case 'createProgram': {
			const { name, description } = data;
			const { data: claimsData } = await supabase.auth.getClaims();
			const coachId = claimsData?.claims?.sub;
			if (!coachId) return error(401, 'Unauthorized');

			const { data: program, error: createErr } = await supabase
				.from('programs')
				.insert({ coach_id: coachId, name, description: description ?? '' })
				.select('id')
				.single();

			if (createErr || !program) return error(500, 'Failed to create program');
			return json({ data: program });
		}

		case 'updateProgram': {
			const { programId, name, description } = data;
			const { error: updateErr } = await supabase
				.from('programs')
				.update({ name, description })
				.eq('id', programId);

			if (updateErr) return error(500, 'Failed to update program');
			return json({ data: { success: true } });
		}

		case 'deleteProgram': {
			const { programId } = data;
			const { error: delErr } = await supabase.from('programs').delete().eq('id', programId);
			if (delErr) return error(500, 'Failed to delete program');
			return json({ data: { success: true } });
		}

		case 'addCycle': {
			const { programId, name, goal, colorKey } = data;

			const { data: maxRow } = await supabase
				.from('cycles')
				.select('position')
				.eq('program_id', programId)
				.order('position', { ascending: false })
				.limit(1)
				.maybeSingle();

			const position = (maxRow?.position ?? -1) + 1;

			const { data: cycle, error: createErr } = await supabase
				.from('cycles')
				.insert({
					program_id: programId,
					name,
					goal: goal ?? '',
					color_key: colorKey ?? 'sky',
					position
				})
				.select('id')
				.single();

			if (createErr || !cycle) return error(500, 'Failed to add cycle');
			return json({ data: cycle });
		}

		case 'updateCycle': {
			const { cycleId, name, goal, colorKey } = data;
			const { error: updateErr } = await supabase
				.from('cycles')
				.update({ name, goal, color_key: colorKey })
				.eq('id', cycleId);

			if (updateErr) return error(500, 'Failed to update cycle');
			return json({ data: { success: true } });
		}

		case 'removeCycle': {
			const { cycleId } = data;
			const { error: delErr } = await supabase.from('cycles').delete().eq('id', cycleId);
			if (delErr) return error(500, 'Failed to remove cycle');
			return json({ data: { success: true } });
		}

		case 'addWeek': {
			const { cycleId } = data;

			const { data: maxRow } = await supabase
				.from('weeks')
				.select('week_number')
				.eq('cycle_id', cycleId)
				.order('week_number', { ascending: false })
				.limit(1)
				.maybeSingle();

			const weekNumber = (maxRow?.week_number ?? 0) + 1;

			const { data: week, error: createErr } = await supabase
				.from('weeks')
				.insert({ cycle_id: cycleId, week_number: weekNumber })
				.select('id')
				.single();

			if (createErr || !week) return error(500, 'Failed to add week');
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

			const { data: sourceWeek } = await supabase
				.from('weeks')
				.select('id, cycle_id')
				.eq('id', sourceWeekId)
				.single();

			if (!sourceWeek) return error(404, 'Week not found');

			const { data: maxRow } = await supabase
				.from('weeks')
				.select('week_number')
				.eq('cycle_id', sourceWeek.cycle_id)
				.order('week_number', { ascending: false })
				.limit(1)
				.maybeSingle();

			const weekNumber = (maxRow?.week_number ?? 0) + 1;

			const { data: newWeek, error: weekErr } = await supabase
				.from('weeks')
				.insert({ cycle_id: sourceWeek.cycle_id, week_number: weekNumber })
				.select('id')
				.single();

			if (weekErr || !newWeek) return error(500, 'Failed to duplicate week');

			try {
				const { data: sessions } = await supabase
					.from('sessions')
					.select(
						'day_number, name, program_exercises(position, note, exercise_id, program_sets(set_number, target_reps))'
					)
					.eq('week_id', sourceWeekId);

				const sourceSessions = sessions ?? [];

				if (sourceSessions.length > 0) {
					const { data: newSessions, error: sessErr } = await supabase
						.from('sessions')
						.insert(
							sourceSessions.map((s) => ({
								week_id: newWeek.id,
								day_number: s.day_number,
								name: s.name
							}))
						)
						.select('id, day_number');

					if (sessErr || !newSessions) throw new Error('session insert failed');

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

						const { data: newPes, error: peErr } = await supabase
							.from('program_exercises')
							.insert(
								pes.map((pe) => ({
									session_id: newSessionId,
									exercise_id: pe.exercise_id,
									position: pe.position,
									note: pe.note
								}))
							)
							.select('id, position');

						if (peErr || !newPes) throw new Error('exercise insert failed');

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
						const { error: setErr } = await supabase.from('program_sets').insert(allSets);
						if (setErr) throw new Error('set insert failed');
					}
				}
			} catch {
				await supabase.from('weeks').delete().eq('id', newWeek.id);
				return error(500, 'Failed to duplicate week');
			}

			return json({ data: await loadWeekDetail(supabase, newWeek.id) });
		}

		case 'removeWeek': {
			const { weekId } = data;
			const { error: delErr } = await supabase.from('weeks').delete().eq('id', weekId);
			if (delErr) return error(500, 'Failed to remove week');
			return json({ data: { success: true } });
		}

		case 'addSession': {
			const { weekId, dayNumber, name } = data;
			const { data: session, error: createErr } = await supabase
				.from('sessions')
				.insert({ week_id: weekId, day_number: dayNumber, name })
				.select('id')
				.single();

			if (createErr || !session) return error(500, 'Failed to add session');
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

			const { data: sourceSession } = await supabase
				.from('sessions')
				.select(
					'name, program_exercises(position, note, exercise_id, program_sets(set_number, target_reps))'
				)
				.eq('id', sourceSessionId)
				.single();

			if (!sourceSession) return error(404, 'Session not found');

			const { data: existing } = await supabase
				.from('sessions')
				.select('id')
				.eq('week_id', destWeekId)
				.eq('day_number', destDayNumber)
				.maybeSingle();

			if (existing) {
				if (!replace) return error(409, 'That day already has a session.');
				const { error: delErr } = await supabase.from('sessions').delete().eq('id', existing.id);
				if (delErr) return error(500, 'Failed to replace the existing session');
			}

			const { data: newSession, error: sessionErr } = await supabase
				.from('sessions')
				.insert({ week_id: destWeekId, day_number: destDayNumber, name: sourceSession.name })
				.select('id')
				.single();

			if (sessionErr || !newSession) return error(500, 'Failed to copy session');

			try {
				const pes = sourceSession.program_exercises ?? [];

				if (pes.length > 0) {
					const { data: newPes, error: peErr } = await supabase
						.from('program_exercises')
						.insert(
							pes.map((pe) => ({
								session_id: newSession.id,
								exercise_id: pe.exercise_id,
								position: pe.position,
								note: pe.note
							}))
						)
						.select('id, position');

					if (peErr || !newPes) throw new Error('exercise insert failed');

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
						const { error: setErr } = await supabase.from('program_sets').insert(allSets);
						if (setErr) throw new Error('set insert failed');
					}
				}
			} catch {
				await supabase.from('sessions').delete().eq('id', newSession.id);
				return error(500, 'Failed to copy session');
			}

			return json({ data: await loadSessionDetail(supabase, newSession.id) });
		}

		case 'updateSession': {
			const { sessionId, name } = data;
			const { error: updateErr } = await supabase
				.from('sessions')
				.update({ name })
				.eq('id', sessionId);
			if (updateErr) return error(500, 'Failed to update session');
			return json({ data: { success: true } });
		}

		case 'removeSession': {
			const { sessionId } = data;
			const { error: delErr } = await supabase.from('sessions').delete().eq('id', sessionId);
			if (delErr) return error(500, 'Failed to remove session');
			return json({ data: { success: true } });
		}

		case 'addProgramExercise': {
			const { sessionId, exercise } = data;

			const exerciseRecord = await getOrCreateExercise(
				supabase,
				exercise.activity,
				exercise.category
			);
			if (!exerciseRecord) return error(500, 'Failed to create exercise');

			const { data: maxRow } = await supabase
				.from('program_exercises')
				.select('position')
				.eq('session_id', sessionId)
				.order('position', { ascending: false })
				.limit(1)
				.maybeSingle();

			const position = (maxRow?.position ?? -1) + 1;

			const { data: programExercise, error: createErr } = await supabase
				.from('program_exercises')
				.insert({
					session_id: sessionId,
					exercise_id: exerciseRecord.id,
					position,
					note: exercise.note ?? ''
				})
				.select('id')
				.single();

			if (createErr || !programExercise) return error(500, 'Failed to add exercise');

			if (exercise.category === 'weight' && exercise.plan?.length > 0) {
				const sets = exercise.plan.map((targetReps: number, i: number) => ({
					program_exercise_id: programExercise.id,
					set_number: i + 1,
					target_reps: targetReps
				}));
				await supabase.from('program_sets').insert(sets);
			}

			return json({ data: programExercise });
		}

		case 'updateProgramExercise': {
			const { programExerciseId, exercise } = data;

			const exerciseRecord = await getOrCreateExercise(
				supabase,
				exercise.activity,
				exercise.category
			);
			if (!exerciseRecord) return error(500, 'Failed to create exercise');

			await supabase.from('program_sets').delete().eq('program_exercise_id', programExerciseId);

			const { error: updateErr } = await supabase
				.from('program_exercises')
				.update({ exercise_id: exerciseRecord.id, note: exercise.note ?? '' })
				.eq('id', programExerciseId);

			if (updateErr) return error(500, 'Failed to update exercise');

			if (exercise.category === 'weight' && exercise.plan?.length > 0) {
				const sets = exercise.plan.map((targetReps: number, i: number) => ({
					program_exercise_id: programExerciseId,
					set_number: i + 1,
					target_reps: targetReps
				}));
				await supabase.from('program_sets').insert(sets);
			}

			return json({ data: { success: true } });
		}

		case 'removeProgramExercise': {
			const { programExerciseId } = data;
			const { error: delErr } = await supabase
				.from('program_exercises')
				.delete()
				.eq('id', programExerciseId);

			if (delErr) return error(500, 'Failed to remove exercise');
			return json({ data: { success: true } });
		}

		case 'reorderProgramExercise': {
			// Same shape of problem as api/workout's reorderExercise (reorder
			// within a sorted sibling list), against program_exercises.
			const { programExerciseId, toIndex } = data;

			const { data: exercise } = await supabase
				.from('program_exercises')
				.select('id, session_id')
				.eq('id', programExerciseId)
				.single();

			if (!exercise) return error(404, 'Exercise not found');

			const { data: rows } = await supabase
				.from('program_exercises')
				.select('id')
				.eq('session_id', exercise.session_id)
				.order('position');

			if (!rows) return error(500, 'Failed to fetch exercises');

			const ids = rows.map((r) => r.id).filter((id) => id !== programExerciseId);
			const dest = Math.max(0, Math.min(toIndex, ids.length));
			ids.splice(dest, 0, programExerciseId);

			for (let k = 0; k < ids.length; k++) {
				if (rows[k]?.id === ids[k]) continue;
				await supabase.from('program_exercises').update({ position: k }).eq('id', ids[k]);
			}

			return json({ data: { success: true } });
		}

		case 'getActiveAssignment': {
			const { athleteId } = data;
			const { data: assignment } = await supabase
				.from('program_assignments')
				.select('id, program_id, start_date')
				.eq('athlete_id', athleteId)
				.eq('status', 'active')
				.maybeSingle();

			return json({ data: assignment ?? null });
		}

		case 'checkAssignConflicts': {
			const { programId, athleteId, startDate } = data;
			const result = await checkAssignConflictsImpl(supabase, programId, athleteId, startDate);
			return json({ data: result });
		}

		case 'assignProgram': {
			const { programId, athleteId, startDate } = data;
			const { data: assignmentId, error: rpcErr } = await supabase.rpc('assign_program', {
				p_program_id: programId,
				p_athlete_id: athleteId,
				p_start_date: startDate
			});

			if (rpcErr) return rpcError(rpcErr.message);
			return json({ data: { assignmentId } });
		}

		case 'checkShiftConflicts': {
			const { assignmentId, athleteId, fromDate, shiftWeeks } = data;
			const result = await checkShiftConflictsImpl(
				supabase,
				assignmentId,
				athleteId,
				fromDate,
				shiftWeeks
			);
			return json({ data: result });
		}

		case 'shiftSchedule': {
			const { assignmentId, fromDate, shiftWeeks } = data;
			const { data: movedCount, error: rpcErr } = await supabase.rpc('shift_program_schedule', {
				p_assignment_id: assignmentId,
				p_from_date: fromDate,
				p_shift_weeks: shiftWeeks
			});

			if (rpcErr) return rpcError(rpcErr.message);
			return json({ data: { movedCount } });
		}

		case 'getBreadcrumb': {
			const { athleteId, dateKey } = data;
			const breadcrumb = await resolveBreadcrumb(supabase, athleteId, dateKey);
			return json({ data: breadcrumb });
		}

		default:
			return error(400, `Unknown action: ${action}`);
	}
};
