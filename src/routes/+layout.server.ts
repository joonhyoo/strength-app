import { building } from '$app/environment';
import type { LayoutServerLoad } from './$types';
import type { Role } from '$lib/types';

export const load: LayoutServerLoad = async ({ depends, locals: { supabase } }) => {
	// Two jobs:
	//  1. `/` and `/auth/error` are prerendered (see src/routes/+page.ts). During
	//     the build there's no request context, so skip the session resolve —
	//     no user data is baked into that shared, cacheable HTML and the
	//     prerender never touches cookies.
	//  2. At runtime this load reads no `url`/`params`, so SvelteKit runs it once
	//     on the initial SSR / first entry into the app and then reuses the
	//     result across every client-side navigation instead of re-fetching the
	//     session + profile on each one (which is what made tab-to-tab nav slow).
	//     `depends('supabase:auth')` is the opt-in re-run signal —
	//     src/routes/+layout.svelte calls `invalidate('supabase:auth')` when the
	//     browser Supabase client sees the token rotate or the session end.
	if (building) return { user: null, expiresAt: null };

	depends('supabase:auth');

	const { data: claimsData } = await supabase.auth.getClaims();
	const userId = claimsData?.claims?.sub;

	if (!userId) {
		return { user: null, expiresAt: null };
	}

	// Unix seconds the access token expires at — src/routes/+layout.svelte
	// compares this against the browser client's live session to tell a real
	// token change from a redundant auth event.
	const expiresAt = claimsData?.claims?.exp ?? null;

	// `profile_private` is a 1:1 extension of `profiles` (shared PK,
	// `profile_private_id_fkey`), so pull `username` in the same round-trip
	// via an embedded select rather than paying for a second query.
	const { data: profile } = await supabase
		.from('profiles')
		.select('id, name, role, terms_accepted_at, coach_id, profile_private(username)')
		.eq('id', userId)
		.single();

	if (!profile) {
		return { user: null, expiresAt: null };
	}

	// profiles.role is `text` at the DB level (see database.types.ts), but a
	// check constraint (`role in ('coach', 'athlete')`) already guarantees
	// it can only be one of these two values — narrowing here, once, at the
	// read boundary, rather than re-asserting it at every call site below.
	// PostgREST returns the 1:1 embed as an object (or null); older/looser
	// relationship detection can hand back a single-element array — accept both.
	const { profile_private, ...rest } = profile;
	const priv = Array.isArray(profile_private) ? profile_private[0] : profile_private;

	return {
		user: { ...rest, role: profile.role as Role, username: priv?.username ?? null },
		expiresAt
	};
};
