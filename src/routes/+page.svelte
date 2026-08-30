<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { HOME_COOKIE, isResumableRoute, LAST_ROUTE_COOKIE } from '$lib/guards';

	// `/` is a prerendered splash shell with no server-side redirect. As soon as
	// it hydrates, send the user to their real route with a *client-side*
	// navigation: #app-splash (in src/app.html, a sibling of the mount point)
	// is never touched by it, so the mark stays painted through this hop and the
	// destination's load — no blank frame, no flash. A wrong guess self-corrects:
	// the (athlete)/(coach) layout guards re-check auth + role on the destination.
	onMount(() => {
		const read = (name: string) => {
			const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
			if (!m) return null;
			try {
				return decodeURIComponent(m[1]);
			} catch {
				return null;
			}
		};

		const home = read(HOME_COOKIE) ?? '/auth/login';
		const last = read(LAST_ROUTE_COOKIE);
		// `last-route` is stored as `pathname + search`; the resumable check runs
		// on the path only.
		const dest = last && isResumableRoute(last.split(/[?#]/)[0]) ? last : home;

		if (dest !== '/') {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- dest is a stored path string, not a statically known route
			goto(dest, { replaceState: true });
		}
	});
</script>

<svelte:head>
	<noscript>
		<meta http-equiv="refresh" content="0;url=/auth/login" />
	</noscript>
</svelte:head>

<!-- Never visible in practice (#app-splash covers it). A dark fill only for the
     edge case where src/app.html's 4s fallback removes the splash before this
     redirect has landed. -->
<div class="min-h-screen bg-[#0d0d0f]"></div>
