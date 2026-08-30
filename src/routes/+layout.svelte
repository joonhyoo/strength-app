<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { afterNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { HOME_COOKIE, isResumableRoute, LAST_ROUTE_COOKIE, roleHome } from '$lib/guards';

	let { children } = $props();

	const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

	function writeCookie(name: string, value: string) {
		const secure = location.protocol === 'https:' ? '; Secure' : '';
		document.cookie =
			`${name}=${encodeURIComponent(value)}; path=/; ` +
			`max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
	}

	// Dismiss the static splash from src/app.html once a real content route is
	// on screen. Guarded against `/` — that route is a bare splash shell that
	// immediately redirects, so removing the splash there would flash an empty
	// page while the destination loads.
	function dismissSplash() {
		if (page.url.pathname === '/') return;
		const splash = document.getElementById('app-splash');
		if (!splash) return;
		splash.classList.add('is-hiding');
		splash.addEventListener('transitionend', () => splash.remove(), { once: true });
		setTimeout(() => splash.remove(), 600);
	}

	onMount(dismissSplash);

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
