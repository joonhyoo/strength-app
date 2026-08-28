import type { LayoutServerLoad } from './$types';
import type { Role } from '$lib/types';

export const load: LayoutServerLoad = async ({ locals: { supabase } }) => {
	const { data: claimsData } = await supabase.auth.getClaims();
	const userId = claimsData?.claims?.sub;

	if (!userId) {
		return { user: null };
	}

	// Independent of each other (both only need userId) — run in parallel
	// rather than paying for two sequential round-trips.
	const [{ data: profile }, { data: priv }] = await Promise.all([
		supabase
			.from('profiles')
			.select('id, name, role, terms_accepted_at, coach_id')
			.eq('id', userId)
			.single(),
		supabase.from('profile_private').select('username').eq('id', userId).maybeSingle()
	]);

	if (!profile) {
		return { user: null };
	}

	// profiles.role is `text` at the DB level (see database.types.ts), but a
	// check constraint (`role in ('coach', 'athlete')`) already guarantees
	// it can only be one of these two values — narrowing here, once, at the
	// read boundary, rather than re-asserting it at every call site below.
	return { user: { ...profile, role: profile.role as Role, username: priv?.username ?? null } };
};
