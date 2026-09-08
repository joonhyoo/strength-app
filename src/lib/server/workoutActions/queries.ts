import { json, type ApiContext } from '$lib/server/apiHandler';
import { dbList, dbMaybe } from '$lib/server/db';

export async function getDay({ data, supabase, log }: ApiContext) {
	const { athleteId, dateKey } = data;
	const workout = await dbMaybe(
		log,
		'workout.getDay',
		supabase
			.from('athlete_workouts')
			.select(
				'id, athlete_exercises(id, exercise_id, note, complete, position, exercises(name, category, video_url), athlete_sets(id, set_number, target_reps, weight, reps))'
			)
			.eq('athlete_id', athleteId)
			.eq('scheduled_date', dateKey)
			.maybeSingle()
	);

	return json({ data: workout ?? null });
}

/**
 * Prior sessions of one catalog exercise for one athlete, most recent first.
 * `!inner` + the embedded exercise_id filter keeps this to workout days that
 * actually contained the lift; the caller (the athlete's exercise modal) then
 * drops any session with nothing logged. Bounded to a recent window — this is
 * a "what did I do last time" glance, not a full training log.
 */
export async function exerciseHistory({ data, supabase, log }: ApiContext) {
	const { athleteId, exerciseId, before } = data;
	const history = await dbList(
		log,
		'workout.exerciseHistory',
		supabase
			.from('athlete_workouts')
			.select(
				'scheduled_date, athlete_exercises!inner(id, complete, exercise_id, athlete_sets(set_number, target_reps, weight, reps))'
			)
			.eq('athlete_id', athleteId)
			.eq('athlete_exercises.exercise_id', exerciseId)
			.lt('scheduled_date', before)
			.order('scheduled_date', { ascending: false })
			.limit(12)
	);

	return json({ data: history });
}

export async function getStatusMap({ data, supabase, log }: ApiContext) {
	const { athleteId, from, to } = data;
	let query = supabase
		.from('athlete_workouts')
		.select(
			'scheduled_date, athlete_exercises(id, complete, exercises(category), athlete_sets(weight))'
		)
		.eq('athlete_id', athleteId);

	if (from) query = query.gte('scheduled_date', from);
	if (to) query = query.lte('scheduled_date', to);

	const workouts = await dbList(log, 'workout.getStatusMap', query);

	return json({ data: workouts });
}
