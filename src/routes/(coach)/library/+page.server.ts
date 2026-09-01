import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	// Streamed (not awaited) so the page shell renders before this resolves.
	// `note` is excluded — the shared 'Note' catalog row backs the note feature
	// but isn't a real, pickable catalog exercise.
	return {
		exercises: supabase
			.from('exercises')
			.select('id, name, category')
			.neq('category', 'note')
			.order('name')
			.then(({ data }) => data ?? [])
	};
};
