import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { canAccess, needsUsername, roleHome } from '$lib/guards';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!canAccess(user, 'coach')) throw redirect(303, roleHome(user?.role ?? null));
	if (needsUsername(user)) throw redirect(303, '/setup-profile');
};
