import type { SupabaseClient } from '@supabase/supabase-js';
import { roleHome } from '$lib/guards';
import { serverLog } from './log';

/**
 * Post-auth landing route, from a fresh role lookup — for use right after an
 * auth mutation (login, OTP verify, profile setup) where no cached `user` from
 * a parent load exists yet.
 *
 * A query error is logged and falls back to `roleHome(null)` (→ /auth/login)
 * rather than thrown: a transient blip shouldn't 500 the login flow, the user
 * just retries. A genuinely-missing profile row (mid-signup) is not an error —
 * `.maybeSingle()` returns null and we route to login.
 */
export async function roleHomeFor(
	supabase: SupabaseClient,
	userId: string
): Promise<ReturnType<typeof roleHome>> {
	const { data: profile, error } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', userId)
		.maybeSingle();

	if (error) serverLog.error('auth.roleHomeFor', error, { userId });
	return roleHome(profile?.role ?? null);
}
