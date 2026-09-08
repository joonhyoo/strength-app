import { error } from '@sveltejs/kit';
import { json, type ApiContext } from '$lib/server/apiHandler';
import {
	checkAssignConflicts as checkAssignConflictsImpl,
	checkShiftConflicts as checkShiftConflictsImpl,
	resolveBreadcrumb
} from '$lib/server/scheduling';

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

export async function checkAssignConflicts({ data, supabase, log }: ApiContext) {
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

export async function assignProgram({ data, supabase, log }: ApiContext) {
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

export async function checkShiftConflicts({ data, supabase, log }: ApiContext) {
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

export async function shiftSchedule({ data, supabase, log }: ApiContext) {
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

export async function getBreadcrumb({ data, supabase, log }: ApiContext) {
	const { athleteId, dateKey } = data;
	const breadcrumb = await resolveBreadcrumb(supabase, athleteId as string, dateKey as string, log);
	return json({ data: breadcrumb });
}
