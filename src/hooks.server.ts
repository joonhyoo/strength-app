import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import { error, type Handle } from '@sveltejs/kit';

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
		if (!claimsData?.claims?.sub) throw error(401, 'Unauthorized');
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name: string) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
