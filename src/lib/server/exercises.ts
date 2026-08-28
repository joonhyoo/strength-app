import type { SupabaseClient } from '@supabase/supabase-js';

/** Look up an exercise definition by name, creating it if it doesn't exist yet. */
export async function getOrCreateExercise(supabase: SupabaseClient, name: string, category: string) {
	const { data: existing } = await supabase
		.from('exercises')
		.select('id, name, category')
		.eq('name', name)
		.maybeSingle();

	if (existing) return existing;

	const { data: created } = await supabase
		.from('exercises')
		.insert({ name, category })
		.select('id, name, category')
		.single();

	return created ?? null;
}
