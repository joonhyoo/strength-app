import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase }, parent }) => {
	const { user } = await parent();

	const { data: athletes } = await supabase
		.from('profiles')
		.select('id, name, email, coach_id')
		.eq('coach_id', user!.id)
		.eq('role', 'athlete')
		.order('name');

	const { data: exercises } = await supabase
		.from('exercises')
		.select('name, category')
		.order('name');

	return {
		athletes: athletes ?? [],
		exerciseLibrary: exercises ?? []
	};
};
