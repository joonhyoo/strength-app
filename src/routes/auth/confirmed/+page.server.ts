import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Where the coach-invite confirmation link's redirectTo lands. Confirming
// shouldn't act as a login — signing out here is defensive insurance (this
// app has no client-side Supabase client to pick up an implicit-flow session
// from the URL fragment in the first place) so the athlete always lands back
// on the normal /auth/login sign-in flow.
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	await supabase.auth.signOut();
	redirect(303, '/auth/login');
};
