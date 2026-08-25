import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

/** Service-role client — invite lookups, admin invite emails, dev quick-login. Never exposed client-side. */
export function adminClient() {
	return createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY!, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
}
