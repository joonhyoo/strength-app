import { building } from '$app/environment';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LayoutServerLoad } from './$types';
import type { Role } from '$lib/types';

const AUTH_TIMEOUT_MS = 3000;
const FALLBACK_TIMEOUT_MS = 2000;
const EMPTY = { user: null, expiresAt: null } as const;

const TIMED_OUT = Symbol('auth-timed-out');

/** Resolves to the promise's value, or `TIMED_OUT` after `ms`. A rejection is
 *  swallowed as `TIMED_OUT` too — the caller falls through as unauthenticated. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(TIMED_OUT), ms);
		const settle = (v: T | typeof TIMED_OUT) => {
			clearTimeout(timer);
			resolve(v);
		};
		p.then(settle, () => settle(TIMED_OUT));
	});
}

/** Base64url-decode a JWT payload without verifying the signature. Used only as
 *  a last resort when `getClaims()` stalls — the token is ES256-signed and
 *  1h-lived, it's read here purely to pick a route, and every data query
 *  re-checks it through RLS with the cookie-bound client. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
	try {
		const seg = token.split('.')[1];
		if (!seg) return null;
		return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
}

const PROFILE_SELECT = 'id, name, role, terms_accepted_at, coach_id, profile_private(username)';

async function buildUser(supabase: SupabaseClient, userId: string, expiresAt: number | null) {
	// `profile_private` is a 1:1 extension of `profiles` (shared PK,
	// `profile_private_id_fkey`), so pull `username` in the same round-trip
	// via an embedded select rather than paying for a second query.
	const { data: profile } = await supabase
		.from('profiles')
		.select(PROFILE_SELECT)
		.eq('id', userId)
		.single();

	if (!profile) return EMPTY;

	// profiles.role is `text` at the DB level (see database.types.ts), but a
	// check constraint (`role in ('coach', 'athlete')`) already guarantees
	// it can only be one of these two values — narrowing here, once, at the
	// read boundary. PostgREST returns the 1:1 embed as an object (or null);
	// older/looser relationship detection can hand back a single-element array.
	const { profile_private, ...rest } = profile;
	const priv = Array.isArray(profile_private) ? profile_private[0] : profile_private;

	return {
		user: { ...rest, role: profile.role as Role, username: priv?.username ?? null },
		expiresAt
	};
}

/** Normal path: verify the JWT (local ES256 check against the cached JWKS),
 *  then load the profile. */
async function resolveUser(supabase: SupabaseClient) {
	const { data: claimsData } = await supabase.auth.getClaims();
	const userId = claimsData?.claims?.sub;
	if (!userId) return EMPTY;
	return buildUser(supabase, userId, claimsData?.claims?.exp ?? null);
}

/** Fallback path: skip verification entirely, take `sub` from the unverified
 *  cookie token. `getSession()` on the ssr server client is a cookie read with
 *  no network (`autoRefreshToken: false`), so this can't hit the same stall. */
async function resolveUserUnverified(supabase: SupabaseClient) {
	const { data } = await supabase.auth.getSession();
	const claims = data.session?.access_token ? decodeJwtPayload(data.session.access_token) : null;
	const userId = typeof claims?.sub === 'string' ? claims.sub : undefined;
	if (!userId) return EMPTY;
	return buildUser(supabase, userId, typeof claims?.exp === 'number' ? claims.exp : null);
}

export const load: LayoutServerLoad = async ({ depends, locals: { supabase } }) => {
	// `/` and `/auth/error` are prerendered (see src/routes/+page.ts). During
	// the build there's no request context, so skip the session resolve.
	if (building) return EMPTY;

	// At runtime this load reads no `url`/`params`, so SvelteKit runs it once
	// on first entry and reuses the result across client navigations.
	// `depends('supabase:auth')` is the opt-in re-run signal — src/routes/
	// +layout.svelte calls `invalidate('supabase:auth')` on a token rotation.
	depends('supabase:auth');

	// Time-box the whole auth + profile resolve. Nothing above this on the `/`
	// bootstrap has a timeout of its own, so a stalled JWKS fetch (the one
	// network call `getClaims()` makes) or a slow `profiles` query would leave
	// the user on the pulsing splash indefinitely. On a timeout, try once more
	// from the unverified cookie token so a returning user with a good session
	// still lands in the app; failing that, fall through as unauthenticated and
	// let the route guards send them to /auth/login.
	const result = await withTimeout(resolveUser(supabase), AUTH_TIMEOUT_MS);
	if (result !== TIMED_OUT) return result;

	const fallback = await withTimeout(resolveUserUnverified(supabase), FALLBACK_TIMEOUT_MS);
	return fallback === TIMED_OUT ? EMPTY : fallback;
};
