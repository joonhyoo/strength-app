import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The signup/login split was retired — a single /auth/login page now
// decides account creation server-side based on whether the typed email
// has a pending coach invite. Redirect rather than 404 in case a coach
// shared an /auth/signup link with an athlete before this change shipped.
export const load: PageServerLoad = () => {
	redirect(303, '/auth/login');
};
