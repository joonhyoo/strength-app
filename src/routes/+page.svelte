<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { HOME_COOKIE, isResumableRoute, LAST_ROUTE_COOKIE } from '$lib/guards';
	import AuthHeader from '$lib/components/AuthHeader.svelte';

	// `/` is a prerendered, user-agnostic shell. Its markup is the static
	// above-the-fold of /auth/login (see the skeleton below) so a cold PWA
	// launch's first paint already looks like the destination — iOS shows its
	// saved snapshot of the last screen during the open animation, and matching
	// it here makes the handoff to the live route seamless instead of flashing a
	// separate splash. On hydrate, redirect to the real route.
	//
	// For an authed relaunch the destination is a real route, not /auth/login;
	// src/app.html's inline script has already set data-boot="resume" (before
	// first paint) which hides the skeleton, so those users just see the dark
	// ground until this redirect lands.
	//
	// `invalidateAll` is load-bearing: the root layout load runs once and is
	// reused across client navigations (see src/routes/+layout.server.ts), and
	// on this prerendered page its data is `{ user: null }`. Forcing it here is
	// what resolves the real session + role at the destination so the guards
	// decide correctly. Only this navigation needs it — tab-to-tab nav must not,
	// or it's slow again.
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
			goto(dest, { replaceState: true, invalidateAll: true });
		}
	});
</script>

<svelte:head>
	<noscript>
		<meta http-equiv="refresh" content="0;url=/auth/login" />
	</noscript>
</svelte:head>

<!-- Sign-in skeleton: the static above-the-fold of /auth/login
     (src/lib/components/AuthForm.svelte), kept in lock-step via <AuthHeader>.
     Hidden for authed relaunches by src/app.html (`[data-boot='resume']`). -->
<div
	id="sign-in-skeleton"
	class="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top))] max-w-md flex-col justify-center px-4 py-6"
	aria-hidden="true"
>
	<AuthHeader />
	<div class="mb-6 flex flex-col gap-3">
		<input
			type="email"
			placeholder="Your email"
			class="input-bordered input w-full"
			tabindex="-1"
			readonly
		/>
		<button type="button" class="btn w-full btn-primary" tabindex="-1">Next</button>
	</div>
</div>
