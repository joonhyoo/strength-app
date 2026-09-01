import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateExercise } from '$lib/server/exercises';
import {
	loadProgramDetail,
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
			// appended to the same cycle — same nested-copy shape as
			// pasteWorkoutDay in api/workout/+server.ts, one level deeper
			// (week -> sessions -> program_exercises -> program_sets).
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

			const { data: sessions } = await supabase
				.from('sessions')
				.select(
					'day_number, name, program_exercises(position, note, exercise_id, program_sets(set_number, target_reps))'
				)
				.eq('week_id', sourceWeekId);

			for (const session of sessions ?? []) {
				const { data: newSession, error: sessionErr } = await supabase
					.from('sessions')
					.insert({ week_id: newWeek.id, day_number: session.day_number, name: session.name })
					.select('id')
					.single();

				if (sessionErr || !newSession) continue;

				for (const pe of session.program_exercises ?? []) {
					const { data: newExercise } = await supabase
						.from('program_exercises')
						.insert({
							session_id: newSession.id,
							exercise_id: pe.exercise_id,
							position: pe.position,
							note: pe.note
						})
						.select('id')
						.single();

					if (newExercise && pe.program_sets?.length) {
						await supabase.from('program_sets').insert(
							pe.program_sets.map((s) => ({
								program_exercise_id: newExercise.id,
								set_number: s.set_number,
								target_reps: s.target_reps
							}))
						);
					}
				}
			}

			return json({ data: newWeek });
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

		case 'moveProgramExercise': {
			// Identical two-phase temp-position swap to api/workout's
			// moveExercise — same shape of problem (reorder within a sorted
			// sibling list), just against program_exercises instead of
			// athlete_exercises.
			const { programExerciseId, direction } = data;

			const { data: exercise } = await supabase
				.from('program_exercises')
				.select('id, position, session_id')
				.eq('id', programExerciseId)
				.single();

			if (!exercise) return error(404, 'Exercise not found');

			const { data: rows } = await supabase
				.from('program_exercises')
				.select('id, position')
				.eq('session_id', exercise.session_id)
				.order('position');

			if (!rows) return error(500, 'Failed to fetch exercises');

			const index = rows.findIndex((r) => r.id === programExerciseId);
			const neighbor = direction === 'up' ? rows[index - 1] : rows[index + 1];
			if (!neighbor) return json({ data: { success: true } });

			await supabase.from('program_exercises').update({ position: -1 }).eq('id', exercise.id);
			await supabase
				.from('program_exercises')
				.update({ position: exercise.position })
				.eq('id', neighbor.id);
			await supabase
				.from('program_exercises')
				.update({ position: neighbor.position })
				.eq('id', exercise.id);

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
