import type { SupabaseClient } from '@supabase/supabase-js';
import { dbMaybe, dbWriteReturning } from './db';
import { serverLog, type Logger } from './log';

/** Look up an exercise definition by name, creating it if it doesn't exist yet.
 *  `videoUrl` only applies on the create path — an existing row's link is left
 *  alone here (use the 'update' API action to change one).
 *
 *  A lookup that *errors* now throws (via dbMaybe) rather than being read as
 *  "doesn't exist" — the old behaviour would fall through to an insert and hit
 *  a unique-name violation, hiding the real cause. */
export async function getOrCreateExercise(
	supabase: SupabaseClient,
	name: string,
	category: string,
	videoUrl?: string | null,
	log: Logger = serverLog
) {
	const existing = await dbMaybe(
		log,
		'exercise.lookup',
		supabase.from('exercises').select('id, name, category').eq('name', name).maybeSingle()
	);

	if (existing) return existing;

	return dbWriteReturning(
		log,
		'exercise.create',
		supabase
			.from('exercises')
			.insert({ name, category, video_url: videoUrl || null })
			.select('id, name, category')
			.single()
	);
}
