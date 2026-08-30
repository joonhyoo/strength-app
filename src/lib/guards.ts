import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role, User } from '$lib/types';

export const LAST_ROUTE_COOKIE = 'last-route';

/**
 * Client-readable (`httpOnly: false`) hint holding the user's role-home path
 * (`/train` or `/dashboard`), set at auth success and cleared on logout. Lets
 * the prerendered `/` splash redirect a returning user without a server-side
 * role lookup — see src/app.html's inline bootstrap and src/routes/+page.svelte.
 */
export const HOME_COOKIE = 'home';

const RESUMABLE_PREFIXES = [
	'/train',
	'/profile',
	'/records',
	'/calendar',
	'/dashboard',
	'/training',
	'/library',
	'/athletes'
];

/** Routes worth relaunching a closed PWA back into — everything else (auth, onboarding, root) isn't. */
export function isResumableRoute(pathname: string): boolean {
	return RESUMABLE_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
	);
}

export function roleHome(role: Role | null): '/auth/login' | '/train' | '/dashboard' {
	switch (role) {
		case 'coach':
			return '/dashboard';
		case 'athlete':
			return '/train';
		default:
			return '/auth/login';
	}
}

export function canAccess(user: User | null, role: Role): boolean {
	return user !== null && user.role === role;
}

export function needsCoach(user: User | null): boolean {
	return user !== null && user.role === 'athlete' && user.coach_id === null;
}

export function needsUsername(user: User | null): boolean {
	return user !== null && !user.username;
}

/**
 * Resolve the post-auth landing route by querying the user's role fresh.
 * For use right after an auth mutation (login, OTP verify, profile setup)
 * where no cached `user` from a parent load is available yet.
 */
export async function roleHomeFor(
	supabase: SupabaseClient,
	userId: string
): Promise<ReturnType<typeof roleHome>> {
	const { data: profile } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', userId)
		.single();

	return roleHome(profile?.role ?? null);
}
