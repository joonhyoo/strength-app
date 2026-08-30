<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { afterNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { isResumableRoute, LAST_ROUTE_COOKIE } from '$lib/guards';

	let { children } = $props();

	// Dismiss the static splash from src/app.html now that the app has
	// hydrated and is painting real content. Fade first, then remove.
	onMount(() => {
		const splash = document.getElementById('app-splash');
		if (!splash) return;
		splash.classList.add('is-hiding');
		splash.addEventListener('transitionend', () => splash.remove(), { once: true });
		setTimeout(() => splash.remove(), 600);
	});

	// Remembers the last route so a closed-and-relaunched PWA (which always
	// re-requests `/`, per manifest start_url) can resume there instead of
	// always landing back on the section home — see src/routes/+page.server.ts.
	afterNavigate(() => {
		if (!isResumableRoute(page.url.pathname)) return;
		const path = page.url.pathname + page.url.search;
		const secure = location.protocol === 'https:' ? '; Secure' : '';
		document.cookie =
			`${LAST_ROUTE_COOKIE}=${encodeURIComponent(path)}; path=/; ` +
			`max-age=${60 * 60 * 24 * 180}; SameSite=Lax${secure}`;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<main class="min-h-screen bg-base-100 pt-[env(safe-area-inset-top)]">
	{@render children()}
</main>
