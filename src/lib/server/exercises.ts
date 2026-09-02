import type { SupabaseClient } from '@supabase/supabase-js';

/** Look up an exercise definition by name, creating it if it doesn't exist yet.
 *  `videoUrl` only applies on the create path — an existing row's link is left
 *  alone here (use the 'update' API action to change one). */
export async function getOrCreateExercise(
	supabase: SupabaseClient,
	name: string,
	category: string,
	videoUrl?: string | null
) {
	const { data: existing } = await supabase
		.from('exercises')
		.select('id, name, category')
		.eq('name', name)
		.maybeSingle();

	if (existing) return existing;

	const { data: created } = await supabase
		.from('exercises')
		.insert({ name, category, video_url: videoUrl || null })
		.select('id, name, category')
		.single();

	return created ?? null;
}
