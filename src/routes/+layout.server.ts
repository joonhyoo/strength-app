import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { supabase } }) => {
	const { data: claimsData } = await supabase.auth.getClaims();
	const userId = claimsData?.claims?.sub;

	if (!userId) {
		return { user: null };
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('id, name, role, terms_accepted_at, coach_id')
		.eq('id', userId)
		.single();

	if (!profile) {
		return { user: null };
	}

	const { data: priv } = await supabase
		.from('profile_private')
		.select('username')
		.eq('id', userId)
		.maybeSingle();

	return { user: { ...profile, username: priv?.username ?? null } };
};
