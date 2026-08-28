import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { canAccess, needsUsername, roleHome } from '$lib/guards';

export const load: LayoutServerLoad = async ({ parent, locals: { supabase } }) => {
	const { user } = await parent();
	if (!canAccess(user, 'coach')) redirect(303, roleHome(user?.role ?? null));
	if (needsUsername(user)) redirect(303, '/setup-profile');

	// Fetched once here (rather than in each coach page) so client-side
	// navigation between coach pages reuses it instead of re-querying —
	// SvelteKit skips re-running this load on nav since it reads no
	// url/params. Streamed (not awaited) so the guards above still gate
	// the section, but this page's own shell doesn't wait on the query.
	return {
		athletes: supabase
			.from('profiles')
			.select('id, name, email, coach_id')
			.eq('coach_id', user!.id)
			.eq('role', 'athlete')
			.order('name')
			.then(({ data }) => data ?? [])
	};
};
