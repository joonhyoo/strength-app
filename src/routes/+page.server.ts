import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isResumableRoute, LAST_ROUTE_COOKIE, roleHome } from '$lib/guards';

export const load: PageServerLoad = async ({ parent, cookies }) => {
	// A closed-and-relaunched PWA always re-requests `/` (manifest start_url),
	// so resume the last route the user was on instead of always dropping
	// them back on the section home.
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

	// Hot path: a resumable cookie is enough to redirect on. Skip `await
	// parent()` here — resolving it forces the root +layout.server.ts load
	// (getClaims + profile query) to run on `/` *and then again* on the
	// redirect target, doubling the blocking round-trips on every cold PWA
	// launch. The value isn't trusted: an invalid or wrong-role destination
	// is still caught by the (athlete)/(coach) layout guards on load.
	if (decoded && isResumableRoute(decoded)) redirect(303, decoded);

	// Cold / first-run path only: no usable cookie, so we do need the role.
	const { user } = await parent();
	redirect(303, roleHome(user?.role ?? null));
};
