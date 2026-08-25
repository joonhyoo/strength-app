import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	// Streamed (not awaited) so the page shell renders before this resolves.
	return {
		exercises: supabase
			.from('exercises')
			.select('id, name, category')
			.order('name')
			.then(({ data }) => data ?? [])
	};
};
