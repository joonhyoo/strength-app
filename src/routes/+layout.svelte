<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { afterNavigate, goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { createBrowserClient } from '@supabase/ssr';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';
	import { HOME_COOKIE, isResumableRoute, LAST_ROUTE_COOKIE, roleHome } from '$lib/guards';

	let { children, data } = $props();

	const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

	function writeCookie(name: string, value: string) {
		const secure = location.protocol === 'https:' ? '; Secure' : '';
		document.cookie =
			`${name}=${encodeURIComponent(value)}; path=/; ` +
			`max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
	}

	// The session is resolved server-side (src/routes/+layout.server.ts), and that
	// load no longer re-runs on every navigation. This browser client is its
	// counterpart: @supabase/ssr keeps the access token auto-refreshed while the
	// app is open (it wires its own visibilitychange listener and writes the
	// rotated cookie back for the next server request), and onAuthStateChange
	// lets a token rotation or a dead session reach the server load without a
	// full reload.
	onMount(() => {
		const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY);

		const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
			// `/` is the prerendered bootstrap shell — +page.svelte's
			// goto(dest, { invalidateAll }) already forces the one auth resolution
			// for launch, and the destination's guards handle a dead session.
			// Anything we do here on top of that (INITIAL_SESSION always looks
			// "changed" against the shell's null expiresAt; a stray goto races the
			// bootstrap one) just piles onto the slowest path there is.
			if (page.url.pathname === '/') return;

			if (event === 'SIGNED_OUT') {
				// Fires when a background refresh fails (session truly dead) or on a
				// cross-tab logout. Onboarding/auth pages handle their own state.
				if (!page.url.pathname.startsWith('/auth')) {
					goto(resolve('/auth/login'), { replaceState: true, invalidateAll: true });
				}
				return;
			}
			// Token refreshed / user updated / signed in from another tab — only
			// worth re-running the server load if the token actually moved.
			if ((session?.expires_at ?? null) !== data.expiresAt) {
				invalidate('supabase:auth');
			}
		});

		return () => sub.subscription.unsubscribe();
	});

	afterNavigate(() => {
		// Keep the client-readable role-home hint fresh, so the prerendered `/`
		// shell can route a returning user without a server lookup — covers
		// anyone who authenticated before this cookie was introduced.
		const role = page.data.user?.role;
		if (role) writeCookie(HOME_COOKIE, roleHome(role));

		// Remembers the last route so a closed-and-relaunched PWA (which always
		// re-requests `/`, per manifest start_url) can resume there.
		if (isResumableRoute(page.url.pathname)) {
			writeCookie(LAST_ROUTE_COOKIE, page.url.pathname + page.url.search);
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<main class="min-h-screen bg-base-100 pt-[env(safe-area-inset-top)]">
	{@render children()}
</main>
