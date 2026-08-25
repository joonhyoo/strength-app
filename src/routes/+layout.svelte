<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { afterNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { isResumableRoute, LAST_ROUTE_COOKIE } from '$lib/guards';

	let { children } = $props();

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
{#if navigating.to}
	<div
		class="nav-progress fixed inset-x-0 z-100 h-[3px] bg-primary"
		style="top: env(safe-area-inset-top)"
		aria-hidden="true"
	></div>
{/if}
<main class="min-h-screen bg-base-100 pt-[env(safe-area-inset-top)]">
	{@render children()}
</main>

<style>
	.nav-progress {
		transform-origin: left;
		animation: nav-progress-grow 8s ease-out forwards;
	}

	@keyframes nav-progress-grow {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(0.9);
		}
	}
</style>
