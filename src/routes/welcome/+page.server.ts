import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { roleHome } from '$lib/guards';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (user) redirect(303, roleHome(user.role));
	return {};
};
