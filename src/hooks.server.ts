import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import { error, type Handle, type HandleServerError } from '@sveltejs/kit';
import { serverLog } from '$lib/server/log';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			/**
			 * Note: You have to add the `path` variable to the
			 * set and remove method due to sveltekit's cookie API
			 * requiring this to be set, setting the path to `/`
			 * will replicate previous/standard behaviour (https://kit.svelte.dev/docs/types#public-types-cookies)
			 */
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, {
						...options,
						path: '/',
						secure: new URL(event.request.url).protocol === 'https:'
					});
				});
			}
		}
	});

	// Defense in depth: `(athlete)`/`(coach)` layout guards don't cover this
	// route group, and RLS grants being locked down is the only thing
	// currently standing between an unauthenticated request and a
	// permission-denied response. Reject it here explicitly too, so a future
	// migration that accidentally re-grants `anon` on a workout table
	// wouldn't silently reopen it.
	if (event.url.pathname.startsWith('/api/')) {
		const { data: claimsData } = await event.locals.supabase.auth.getClaims();
		const sub = claimsData?.claims?.sub;
		if (!sub) {
			serverLog.warn('api.unauthorized', { path: event.url.pathname });
			throw error(401, 'Unauthorized');
		}
		event.locals.userId = sub;
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name: string) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

/**
 * Last line of defence for page/action/render errors. SvelteKit calls this for
 * a genuine unhandled throw (always surfaced as 500) AND for a plain 404 on an
 * unmatched route. A <500 is not a bug and Vercel's request log already records
 * the path + status — nothing to add, so return quietly. A 500 gets a fresh
 * `errorId`, logged with the stack and echoed to `+error.svelte` so a
 * "Reference: …" screenshot leads straight to it. `apiHandler` already handles
 * `/api/*`, and `streamList` / the auth timeout swallow the routine DB-error
 * paths, so a 500 here is a real bug.
 */
export const handleError: HandleServerError = ({ error: err, event, status }) => {
	if (status < 500) return { message: status === 404 ? 'Not found' : 'Request error' };

	const errorId = crypto.randomUUID();
	serverLog.error('unhandled', err, {
		errorId,
		path: event.url.pathname,
		routeId: event.route.id,
		status
	});
	return { message: 'Something went wrong.', errorId };
};
