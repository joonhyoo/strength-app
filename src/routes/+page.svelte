<script lang="ts">
	import { onMount } from 'svelte';
	import { HOME_COOKIE, isResumableRoute, LAST_ROUTE_COOKIE } from '$lib/guards';

	// Fallback path only. The inline bootstrap in src/app.html normally
	// `location.replace()`s away before this component ever mounts — this
	// covers the case where that script bailed (e.g. a malformed cookie threw).
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

		const last = read(LAST_ROUTE_COOKIE);
		const home = read(HOME_COOKIE);
		const dest = last && isResumableRoute(last) ? last : (home ?? '/auth/login');

		// Full-document replace (not client-side goto) — this is a launch
		// bootstrap, same as the inline script in src/app.html, and the
		// destination is an arbitrary stored path rather than a typed route.
		if (dest !== '/') location.replace(dest);
	});
</script>

<svelte:head>
	<noscript>
		<meta http-equiv="refresh" content="0;url=/auth/login" />
	</noscript>
</svelte:head>

<!-- Matches #app-splash in src/app.html so there's no visual seam if this
     renders before the redirect commits. -->
<div class="flex min-h-screen items-center justify-center bg-[#0D0D0F]">
	<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="96" height="96">
		<defs>
			<linearGradient id="splashGradient" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stop-color="#F1E0C5" />
				<stop offset="50%" stop-color="#F46036" />
				<stop offset="100%" stop-color="#D7263D" />
			</linearGradient>
		</defs>
		<path
			fill="url(#splashGradient)"
			d="M 21.6,7.231 L 21.6,15.603 A 0.645,0.645 0 0,1 21.308,16.109 L 21.033,16.273 C 19.665,17.065 18.46,17.762 17.243,18.464 L 17.243,9.41 L 9.404,4.878 C 10.761,4.099 12.113,3.313 13.471,2.538 A 0.647,0.647 0 0,1 14.055,2.538 L 21.599,6.894 L 21.599,7.231 L 21.6,7.231 M 14.549,11.792 L 14.549,18.071 A 0.484,0.484 0 0,1 14.329,18.451 L 14.124,18.574 C 13.097,19.168 12.194,19.691 11.281,20.217 L 11.281,13.427 L 5.402,10.028 C 6.419,9.444 7.433,8.854 8.452,8.272 A 0.485,0.485 0 0,1 8.89,8.272 L 14.548,11.54 L 14.548,11.792 L 14.549,11.792 M 9.26,15.213 L 9.26,19.923 A 0.363,0.363 0 0,1 9.096,20.207 L 8.941,20.3 C 8.172,20.745 7.494,21.137 6.81,21.532 L 6.81,16.439 L 2.4,13.89 C 3.163,13.452 3.923,13.009 4.687,12.573 A 0.364,0.364 0 0,1 5.016,12.573 L 9.259,15.024 L 9.259,15.213 L 9.26,15.213"
		/>
	</svg>
</div>
