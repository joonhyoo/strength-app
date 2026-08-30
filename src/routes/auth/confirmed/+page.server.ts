import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { HOME_COOKIE, LAST_ROUTE_COOKIE } from '$lib/guards';

// Where the coach-invite confirmation link lands. Unlike GoTrue's own
// /auth/v1/verify redirect endpoint — which reports success/failure only in
// the URL fragment, invisible to any server — this route is linked to
// directly (invite.html sends `?token_hash={{ .TokenHash }}`, not
// {{ .ConfirmationURL }}), so verification happens right here and the
// result is an ordinary {data, error} this load can branch on.
export const load: PageServerLoad = async ({ url, locals: { supabase }, cookies }) => {
	const tokenHash = url.searchParams.get('token_hash');

	const { error } = tokenHash
		? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' })
		: { error: true };

	// verifyOtp above may have just created a real session — unlike the old
	// fragment-based redirect, which this app never picked up client-side
	// anyway. Confirming still shouldn't act as a login, so sign it out; the
	// athlete goes through the normal OTP-code flow for their first real
	// sign-in.
	await supabase.auth.signOut();
	cookies.delete(HOME_COOKIE, { path: '/' });
	cookies.delete(LAST_ROUTE_COOKIE, { path: '/' });

	redirect(303, error ? '/auth/login' : '/auth/login?confirmed=1');
};
