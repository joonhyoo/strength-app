import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	// `athletes` comes from the (coach) layout's load and is merged into
	// page data automatically — no need to re-fetch it here. Streamed (not
	// awaited) so the page shell renders before this resolves.
	return {
		// `note` is excluded — the shared 'Note' catalog row backs the note
		// feature but isn't a real, pickable catalog exercise.
		exerciseLibrary: supabase
			.from('exercises')
			.select('name, category')
			.neq('category', 'note')
			.order('name')
			.then(({ data }) => data ?? [])
	};
};
