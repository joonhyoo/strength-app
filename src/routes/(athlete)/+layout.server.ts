import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { canAccess, needsCoach, needsUsername, roleHome } from '$lib/guards';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!canAccess(user, 'athlete')) redirect(303, roleHome(user?.role ?? null));
	if (needsUsername(user)) redirect(303, '/setup-profile');
	if (needsCoach(user)) redirect(303, '/join');
};
