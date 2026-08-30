import type { LayoutServerLoad } from './$types';
import type { Role } from '$lib/types';

export const load: LayoutServerLoad = async ({ locals: { supabase } }) => {
	const { data: claimsData } = await supabase.auth.getClaims();
	const userId = claimsData?.claims?.sub;

	if (!userId) {
		return { user: null };
	}

	// `profile_private` is a 1:1 extension of `profiles` (shared PK,
	// `profile_private_id_fkey`), so pull `username` in the same round-trip
	// via an embedded select rather than paying for a second query — this
	// load blocks first paint on every navigation.
	const { data: profile } = await supabase
		.from('profiles')
		.select('id, name, role, terms_accepted_at, coach_id, profile_private(username)')
		.eq('id', userId)
		.single();

	if (!profile) {
		return { user: null };
	}

	// profiles.role is `text` at the DB level (see database.types.ts), but a
	// check constraint (`role in ('coach', 'athlete')`) already guarantees
	// it can only be one of these two values — narrowing here, once, at the
	// read boundary, rather than re-asserting it at every call site below.
	// PostgREST returns the 1:1 embed as an object (or null); older/looser
	// relationship detection can hand back a single-element array — accept both.
	const { profile_private, ...rest } = profile;
	const priv = Array.isArray(profile_private) ? profile_private[0] : profile_private;

	return { user: { ...rest, role: profile.role as Role, username: priv?.username ?? null } };
};
