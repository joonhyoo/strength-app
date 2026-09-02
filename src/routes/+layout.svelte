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

	// Dismiss the static splash from src/app.html. It covers the whole cold-start
	// path — the prerendered `/` shell, the client hop to the real route, and
	// that route's load — so nothing half-built is ever on screen. Guarded
	// against `/` (a bare shell that immediately redirects) and run once. Called
	// from both onMount and afterNavigate — whichever reaches a real route first.
	let splashDismissed = false;
	function dismissSplash() {
		if (splashDismissed || page.url.pathname === '/') return;
		const splash = document.getElementById('app-splash');
		if (!splash) return;
		splashDismissed = true;

		const reveal = () => {
			// The destination is painted behind the cover. Drop it — #0d0d0f on
			// #0d0d0f, so the only visible change is the content appearing. Always
			// a View Transition where supported: the browser crossfades snapshots
			// composited above the window, so no bare frame (black or the UA
			// backdrop) can show between removing the cover and the destination.
			// With a destination mark (`[data-app-mark]`, e.g. the auth header)
			// the splash mark is tagged and glides into it; without one it stays
			// part of `root` and the whole cover just crossfades. Under
			// prefers-reduced-motion (or no View Transition API) it's a plain
			// swap — safe now that the `painted` gate below guarantees the
			// destination is already on screen underneath.
			const destMark = document.querySelector<HTMLElement>('[data-app-mark]');
			const splashImg = splash.querySelector<HTMLElement>('img');
			const swap = () => {
				splash.remove();
				destMark?.style.setProperty('view-transition-name', 'app-splash-mark');
			};
			const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
			if (!reduced && typeof document.startViewTransition === 'function') {
				if (destMark) splashImg?.style.setProperty('view-transition-name', 'app-splash-mark');
				const vt = document.startViewTransition(swap);
				vt.finished.finally(() => destMark?.style.removeProperty('view-transition-name'));
			} else {
				splash.remove();
			}
		};

		// Two gates, whichever finishes last:
		//  - a fixed minimum on screen from first paint, so a fast auth
		//    resolution still reads as a splash, not a flash;
		//  - the destination has actually rendered content into <main>. The old
		//    signal was `requestIdleCallback`, which fires in the idle gap right
		//    after afterNavigate — before the route's data and child components
		//    paint — so the reveal caught one blank frame (the black blink).
		//    Poll for real content instead, capped so a genuinely empty
		//    destination can't strand the splash.
		const MIN_ON_SCREEN_MS = 1200;
		const [fcp] = performance.getEntriesByName('first-contentful-paint');
		const shownFor = performance.now() - (fcp?.startTime ?? 0);
		const painted = new Promise<void>((resolve) => {
			const deadline = performance.now() + 2000;
			const check = () => {
				const ready = !!document.querySelector('main')?.textContent?.trim();
				if (ready || performance.now() > deadline) {
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
				} else {
					requestAnimationFrame(check);
				}
			};
			check();
		});
		const floor = new Promise<void>((resolve) =>
			setTimeout(resolve, Math.max(0, MIN_ON_SCREEN_MS - shownFor))
		);

		Promise.all([painted, floor]).then(() => requestAnimationFrame(reveal));
	}

	onMount(dismissSplash);

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
		dismissSplash();

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
