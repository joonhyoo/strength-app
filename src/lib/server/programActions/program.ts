import { error } from '@sveltejs/kit';
import { json, type ApiContext } from '$lib/server/apiHandler';
import { dbList, dbWrite, dbWriteReturning } from '$lib/server/db';
import { loadProgramDetail } from '$lib/server/programTree';

export async function listPrograms({ supabase, log }: ApiContext) {
	const programs = await dbList(
		log,
		'program.list',
		supabase.from('programs').select('id, name, description, cycles(id, weeks(id))').order('name')
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

export async function getProgram({ data, supabase, log }: ApiContext) {
	const { programId } = data;
	const detail = await loadProgramDetail(supabase, programId as string, log);
	if (!detail) return error(404, 'Program not found.');
	return json({ data: detail });
}

export async function createProgram({ data, supabase, log }: ApiContext) {
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

export async function updateProgram({ data, supabase, log }: ApiContext) {
	const { programId, name, description } = data;
	await dbWrite(
		log,
		'program.update',
		supabase.from('programs').update({ name, description }).eq('id', programId)
	);
	return json({ data: { success: true } });
}

export async function deleteProgram({ data, supabase, log }: ApiContext) {
	const { programId } = data;
	await dbWrite(log, 'program.delete', supabase.from('programs').delete().eq('id', programId));
	return json({ data: { success: true } });
}
