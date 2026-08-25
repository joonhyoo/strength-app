import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { canAccess, needsUsername, roleHome } from '$lib/guards';

export const load: LayoutServerLoad = async ({ parent, locals: { supabase } }) => {
	const { user } = await parent();
	if (!canAccess(user, 'coach')) throw redirect(303, roleHome(user?.role ?? null));
	if (needsUsername(user)) throw redirect(303, '/setup-profile');

	// Fetched once here (rather than in each coach page) so client-side
	// navigation between coach pages reuses it instead of re-querying —
	// SvelteKit skips re-running this load on nav since it reads no
	// url/params.
	const { data: athletes } = await supabase
		.from('profiles')
		.select('id, name, email, coach_id')
		.eq('coach_id', user!.id)
		.eq('role', 'athlete')
		.order('name');

	return { athletes: athletes ?? [] };
};
