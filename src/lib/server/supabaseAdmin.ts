import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

/**
 * Server-only admin client — invite lookups, admin invite emails, dev quick-login.
 * Never exposed client-side.
 *
 * Prefers the new `sb_secret_…` key (`SUPABASE_SECRET_KEY`) and falls back to the
 * legacy service-role JWT (`SUPABASE_SERVICE_ROLE_KEY`), so this keeps working
 * whichever the local stack and the hosted project issue. Throws rather than
 * build a client with an undefined key — that client 401s on every call, which
 * is hard to trace back to a missing env var.
 */
export function adminClient() {
	const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) throw new Error('Neither SUPABASE_SECRET_KEY nor SUPABASE_SERVICE_ROLE_KEY is set');

	return createClient(PUBLIC_SUPABASE_URL, key, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
}
