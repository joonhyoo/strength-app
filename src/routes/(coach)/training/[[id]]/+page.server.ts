import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	// `athletes` comes from the (coach) layout's load and is merged into
	// page data automatically — no need to re-fetch it here.
	const { data: exercises } = await supabase
		.from('exercises')
		.select('name, category')
		.order('name');

	return {
		exerciseLibrary: exercises ?? []
	};
};
