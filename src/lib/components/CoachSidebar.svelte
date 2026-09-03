<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { enhanceReplace } from '$lib/forms';
	import { clearClientCaches } from '$lib/clientCache';
	import Button from '$lib/components/Button.svelte';
	import DashboardLineIcon from '@iconify-svelte/mingcute/dashboard-line';
	import DashboardFillIcon from '@iconify-svelte/mingcute/dashboard-fill';
	import GroupLineIcon from '@iconify-svelte/mingcute/group-line';
	import GroupFillIcon from '@iconify-svelte/mingcute/group-fill';
	import BookLineIcon from '@iconify-svelte/mingcute/book-line';
	import BookFillIcon from '@iconify-svelte/mingcute/book-fill';
	import CalendarLineIcon from '@iconify-svelte/mingcute/calendar-line';
	import CalendarFillIcon from '@iconify-svelte/mingcute/calendar-fill';

	interface Props {
		/** Controls the mobile off-canvas drawer; ignored on lg+ where the
		 * sidebar is always visible. */
		open?: boolean;
		onclose?: () => void;
	}

	let { open = false, onclose }: Props = $props();

	// Two-letter initials for the footer avatar chip, e.g. "Jordan Rivera" -> "JR".
	const initials = $derived(
		(page.data.user?.name ?? '')
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w: string) => w[0]?.toUpperCase())
			.join('') || '?'
	);

	const links = [
		{
			href: '/dashboard',
			label: 'Dashboard',
			icon: DashboardLineIcon,
			iconActive: DashboardFillIcon
		},
		{ href: '/athletes', label: 'Athletes', icon: GroupLineIcon, iconActive: GroupFillIcon },
		{ href: '/library', label: 'Library', icon: BookLineIcon, iconActive: BookFillIcon },
		{ href: '/training', label: 'Training', icon: CalendarLineIcon, iconActive: CalendarFillIcon }
	] as const;
</script>

{#snippet content()}
	<div class="flex h-full flex-col">
		<div class="flex items-center gap-2 border-b border-base-300 px-4 py-3">
			<img src="/favicon.svg" alt="" class="h-6 w-6 shrink-0 self-center" />
			<span class="font-display text-lg leading-none font-bold uppercase">Strength App</span>
		</div>

		<!-- Nav switches replace rather than push; see the note in src/app.html. -->
		<nav class="flex flex-1 flex-col gap-1 p-3">
			{#each links as link (link.href)}
				{@const active = page.url.pathname.startsWith(link.href)}
				{@const Icon = active ? link.iconActive : link.icon}
				<a
					href={resolve(link.href)}
					aria-current={active ? 'page' : undefined}
					onclick={onclose}
					class="flex items-center gap-3 rounded-r-lg border-l-2 px-3 py-2 text-sm font-medium {active
						? 'border-primary bg-primary/10 text-primary'
						: 'border-transparent text-base-content/60 hover:bg-base-200'}"
				>
					<Icon class="size-5" />
					{link.label}
				</a>
			{/each}
		</nav>

		<div class="flex items-center justify-between gap-2 border-t border-base-300 p-3">
			<div class="flex min-w-0 items-center gap-2">
				<span
					class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-xs font-bold text-primary-content"
				>
					{initials}
				</span>
				<p class="min-w-0 flex-1 truncate text-sm text-base-content/60">{page.data.user?.name}</p>
			</div>
			<form
				method="POST"
				action="/auth/login?/logout"
				use:enhance={enhanceReplace({ onDone: () => void clearClientCaches() })}
			>
				<Button variant="ghost" size="sm" type="submit">Log out</Button>
			</form>
		</div>
	</div>
{/snippet}

<!-- Desktop: persistent sidebar -->
<aside class="hidden w-56 shrink-0 border-r border-base-300 bg-base-200 lg:block">
	{@render content()}
</aside>

<!-- Mobile: off-canvas drawer. Always mounted (not `{#if open}`) and animated
	 with CSS transitions on transform/opacity instead of Svelte's transition
	 directives — a `{#if}`-gated fly/fade only reliably plays the intro; the
	 outro is prone to getting cut short depending on how the removal is
	 triggered. Toggling classes on an always-present element sidesteps that
	 entirely and animates symmetrically in both directions. -->
<div
	class="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden {open
		? 'pointer-events-auto opacity-100'
		: 'pointer-events-none opacity-0'}"
	inert={!open}
>
	<button
		type="button"
		aria-label="Close navigation"
		class="absolute inset-0"
		onclick={onclose}
		tabindex={open ? 0 : -1}
	></button>
	<aside
		class="absolute inset-y-0 left-0 w-56 -translate-x-full bg-base-200 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-xl transition-transform duration-200 {open
			? 'translate-x-0'
			: ''}"
	>
		{@render content()}
	</aside>
</div>
