import { json, type ApiContext } from '$lib/server/apiHandler';
import { dbMaybe, dbWrite, dbWriteReturning } from '$lib/server/db';

export async function addCycle({ data, supabase, log }: ApiContext) {
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

export async function updateCycle({ data, supabase, log }: ApiContext) {
	const { cycleId, name, goal, colorKey } = data;
	await dbWrite(
		log,
		'cycle.update',
		supabase.from('cycles').update({ name, goal, color_key: colorKey }).eq('id', cycleId)
	);
	return json({ data: { success: true } });
}

export async function removeCycle({ data, supabase, log }: ApiContext) {
	const { cycleId } = data;
	await dbWrite(log, 'cycle.remove', supabase.from('cycles').delete().eq('id', cycleId));
	return json({ data: { success: true } });
}
