<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import BarbellLineIcon from '@iconify-svelte/mingcute/barbell-line';
	import BarbellFillIcon from '@iconify-svelte/mingcute/barbell-fill';
	import MedalLineIcon from '@iconify-svelte/mingcute/medal-line';
	import MedalFillIcon from '@iconify-svelte/mingcute/medal-fill';
	//	import CalendarLineIcon from '@iconify-svelte/mingcute/calendar-line';
	//	import CalendarFillIcon from '@iconify-svelte/mingcute/calendar-fill';
	import User3LineIcon from '@iconify-svelte/mingcute/user-3-line';
	import User3FillIcon from '@iconify-svelte/mingcute/user-3-fill';

	let { children } = $props();

	const links = [
		//	{ href: '/calendar', label: 'Calendar', icon: CalendarLineIcon, iconActive: CalendarFillIcon },
		{ href: '/records', label: 'Records', icon: MedalLineIcon, iconActive: MedalFillIcon },
		{ href: '/train', label: 'Train', icon: BarbellLineIcon, iconActive: BarbellFillIcon },
		{ href: '/profile', label: 'Profile', icon: User3LineIcon, iconActive: User3FillIcon }
	] as const;
</script>

<!-- Capped to a phone-ish column so the athlete UI reads the same on a desktop
	 browser as on a phone (matched by the full-screen modals). -->
<div
	class="mx-auto grid h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-[750px] grid-rows-[1fr_auto] md:border-x md:border-base-300"
>
	<div class="overflow-y-auto overscroll-y-contain px-4">
		{@render children()}
	</div>

	<!-- Tab switches replace rather than push; see the note in src/app.html. -->
	<nav class="border-t border-base-300 bg-base-100">
		<div
			class="flex items-stretch justify-around pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
		>
			{#each links as link (link.href)}
				{@const active = page.url.pathname.startsWith(link.href)}
				{@const Icon = active ? link.iconActive : link.icon}
				<a
					href={resolve(link.href)}
					aria-current={active ? 'page' : undefined}
					class="flex flex-1 flex-col items-center justify-center gap-1 {active
						? 'text-primary'
						: 'text-base-content/60'}"
				>
					<Icon height="1.6em" />
					<span class="text-xs">{link.label}</span>
				</a>
			{/each}
		</div>
	</nav>
</div>
