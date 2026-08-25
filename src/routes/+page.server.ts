import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isResumableRoute, LAST_ROUTE_COOKIE, roleHome } from '$lib/guards';
import type { Role } from '$lib/types';

export const load: PageServerLoad = async ({ locals: { supabase }, cookies }) => {
	const { data } = await supabase.auth.getClaims();
	const userId = data?.claims?.sub;

	let role: Role | null = null;

	if (userId) {
		const { data: profile } = await supabase
			.from('profiles')
			.select('role')
			.eq('id', userId)
			.single();

		role = profile?.role ?? null;
	}

	// A closed-and-relaunched PWA always re-requests `/` (manifest start_url),
	// so resume the last route the user was on instead of always dropping
	// them back on the section home. Re-validated (not just trusted) in case
	// the cookie is stale or tampered with — an invalid/wrong-role value
	// still gets caught by the (athlete)/(coach) layout guards on load.
	const lastRoute = cookies.get(LAST_ROUTE_COOKIE);
	const decoded = lastRoute && decodeURIComponent(lastRoute);
	const destination = decoded && isResumableRoute(decoded) ? decoded : roleHome(role);

	redirect(303, destination);
};
