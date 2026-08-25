import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { roleHome } from '$lib/guards';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data } = await supabase.auth.getClaims();
	const userId = data?.claims?.sub;

	if (userId) {
		const { data: profile } = await supabase
			.from('profiles')
			.select('role')
			.eq('id', userId)
			.single();

		if (profile) {
			redirect(303, roleHome(profile.role));
		}
	}

	return {};
};
