import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isResumableRoute, LAST_ROUTE_COOKIE, roleHome } from '$lib/guards';

export const load: PageServerLoad = async ({ parent, cookies }) => {
	// The root layout already resolved `user` (and its role) for this
	// navigation — reuse it instead of re-querying claims/profile.
	const { user } = await parent();

	// A closed-and-relaunched PWA always re-requests `/` (manifest start_url),
	// so resume the last route the user was on instead of always dropping
	// them back on the section home. Re-validated (not just trusted) in case
	// the cookie is stale or tampered with — an invalid/wrong-role value
	// still gets caught by the (athlete)/(coach) layout guards on load.
	const lastRoute = cookies.get(LAST_ROUTE_COOKIE);
	// A malformed value (bad percent-encoding) throws here rather than
	// failing the `isResumableRoute` check below — since the cookie is
	// client-controlled, decode defensively rather than let a tampered
	// cookie 500 the root route.
	let decoded: string | null = null;
	try {
		decoded = lastRoute ? decodeURIComponent(lastRoute) : null;
	} catch {
		// Falls through to roleHome() below.
	}
	const destination = decoded && isResumableRoute(decoded) ? decoded : roleHome(user?.role ?? null);

	redirect(303, destination);
};
