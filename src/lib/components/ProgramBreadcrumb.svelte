<script lang="ts">
	import { getBreadcrumb } from '$lib/services/programTemplateService.svelte';
	import { toKey } from '$lib/dateKey';
	import type { Breadcrumb } from '$lib/types';

	let {
		athleteId,
		date,
		crumb: provided,
		showLabel = true,
		class: extraClass = ''
	}: {
		/** Fetch mode (athlete Train): resolve this day's own crumb from the
		 * server, blanking it while a new day/athlete resolves. */
		athleteId?: string;
		date?: Date;
		/** Pre-resolved mode (coach Training, which already loads the whole
		 * week's crumbs): render this as given and never fetch. `null` renders
		 * nothing. Supplying it ignores athleteId/date. */
		crumb?: Breadcrumb | null;
		/** Set false to render only the Program › Cycle › Week X of Y line,
		 * without the trailing day-label chip — used on the coach Training
		 * page, where WorkoutTimeline shows each visible day's own label
		 * inline instead of one label for just the focused day. */
		showLabel?: boolean;
		class?: string;
	} = $props();

	const dateKey = $derived(date ? toKey(date) : '');

	let fetched = $state<Breadcrumb | null>(null);
	let loadToken = 0;
	let shownFor = '';

	$effect(() => {
		if (provided !== undefined || !athleteId || !dateKey) return;
		const id = athleteId;
		const key = dateKey;
		const identity = `${id}:${key}`;
		// Switching athlete/date fires overlapping loads; only the newest wins.
		const token = ++loadToken;

		// A new day/athlete: drop the previous crumb immediately so the old
		// "Week X of Y" line doesn't linger under the new date while this resolves.
		if (identity !== shownFor) fetched = null;

		getBreadcrumb(id, key)
			.then((result) => {
				if (token !== loadToken) return;
				shownFor = identity;
				fetched = result;
			})
			.catch((e) => console.warn('[breadcrumb] resolve failed', e));
	});

	const crumb = $derived(provided !== undefined ? provided : fetched);
</script>

{#if crumb}
	<nav class="mb-4 flex flex-wrap items-center gap-1 text-sm {extraClass}">
		<span class="text-base-content/60">{crumb.programName}</span>
		<span class="text-base-content/40">›</span>
		<span class="text-base-content/60">{crumb.cycleName}</span>
		<span class="text-base-content/40">›</span>
		<span class="text-base-content/60">Week {crumb.weekOfTotal} of {crumb.totalWeeks}</span>
		{#if showLabel}
			<span class="text-base-content/40">·</span>
			<span class="rounded-lg bg-primary/10 px-2 py-0.5 font-semibold text-primary"
				>{crumb.label}</span
			>
		{/if}
	</nav>
{/if}
