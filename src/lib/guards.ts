import type { Role, User } from '$lib/types';

export const LAST_ROUTE_COOKIE = 'last-route';

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
