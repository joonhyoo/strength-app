import { error } from '@sveltejs/kit';
import { addDays, diffDays } from '$lib/dateKey';
import { json, type ApiContext } from '$lib/server/apiHandler';
import { dbList, dbWrite } from '$lib/server/db';
import { pasteWorkoutDay } from '$lib/server/pasteWorkoutDay';

export async function pasteDay({ data, supabase, log }: ApiContext) {
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

export async function checkPasteWeekConflicts({ data, supabase, log }: ApiContext) {
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

export async function pasteWeek({ data, supabase, log }: ApiContext) {
	const { sourceAthleteId, sourceWeekStart, destAthleteId, destWeekStart } = data;

	// Only the days that actually had source content are touched — a rest day
	// in the source week leaves whatever's at the matching destination day
	// untouched, rather than clearing it.
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

	// Each day pastes independently: a day either takes the copy fully or is
	// left as it was (see pasteWorkoutDay). A failing day is logged and
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

export async function clearWeek({ data, supabase, log }: ApiContext) {
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
