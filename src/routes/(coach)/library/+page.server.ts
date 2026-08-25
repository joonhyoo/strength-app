import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data: exercises } = await supabase
		.from('exercises')
		.select('id, name, category')
		.order('name');

	return {
		exercises: exercises ?? []
	};
};
