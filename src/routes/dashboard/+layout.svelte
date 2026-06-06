<script lang="ts">
	import { page } from '$app/state';
	import BarbellLineIcon from '@iconify-svelte/mingcute/barbell-line';
	import BarbellFillIcon from '@iconify-svelte/mingcute/barbell-fill';
	import MedalLineIcon from '@iconify-svelte/mingcute/medal-line';
	import MedalFillIcon from '@iconify-svelte/mingcute/medal-fill';
	import CalendarLineIcon from '@iconify-svelte/mingcute/calendar-line';
	import CalendarFillIcon from '@iconify-svelte/mingcute/calendar-fill';

	let { children } = $props();

	const links = [
		{
			href: '/dashboard/calendar',
			label: 'Calendar',
			icon: CalendarLineIcon,
			iconActive: CalendarFillIcon
		},
		{
			href: '/dashboard/train',
			label: 'Train',
			icon: BarbellLineIcon,
			iconActive: BarbellFillIcon
		},
		{ href: '/dashboard/records', label: 'Records', icon: MedalLineIcon, iconActive: MedalFillIcon }
	];
</script>

<div class="px-4">
	{@render children()}
</div>

<nav class="dock">
	{#each links as link}
		{@const active = page.url.pathname.startsWith(link.href)}
		{@const Icon = active ? link.iconActive : link.icon}
		<a href={link.href} class:dock-active={active}>
			<Icon height="1.6em" />
			<span class="dock-label">{link.label}</span>
		</a>
	{/each}
</nav>
