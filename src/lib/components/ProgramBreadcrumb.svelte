<script lang="ts">
	import { getBreadcrumb } from '$lib/services/programTemplateService.svelte';
	import type { Breadcrumb } from '$lib/types';

	// `revision` is an opaque counter the caller bumps after a mutation that
	// could change this day's breadcrumb (assign/shift/paste/template edit).
	// Kept as a plain prop rather than reading a specific state class, so this
	// component works unchanged on both the coach Training page and the
	// athlete Train page, which have entirely different state shapes.
	let {
		athleteId,
		date,
		revision = 0,
		showLabel = true,
		onResolved
	}: {
		athleteId: string;
		date: Date;
		revision?: number;
		/** Set false to render only the Program › Cycle › Week X of Y line,
		 * without the trailing day-label chip — used on the coach Training
		 * page, where WorkoutTimeline shows each visible day's own label
		 * inline instead of one label for just the focused day. */
		showLabel?: boolean;
		/** Reports the resolved crumb (or null) back to the caller — lets a
		 * parent like the athlete Train page distinguish "rest day within a
		 * program" / "program complete" / "no program at all" for its own
		 * heading text, without duplicating the fetch. */
		onResolved?: (crumb: Breadcrumb | null) => void;
	} = $props();

	const dateKey = $derived(date.toLocaleDateString('fr-CA'));

	let crumb = $state<Breadcrumb | null>(null);
	let loadToken = 0;
	let shownFor = '';

	$effect(() => {
		void revision;
		const id = athleteId;
		const key = dateKey;
		const identity = `${id}:${key}`;
		// Switching athlete/date (or a revision bump) fires overlapping loads;
		// only the newest response may write state.
		const token = ++loadToken;

		// A new day/athlete: drop the previous crumb immediately so the old
		// "Week X of Y" line doesn't linger under the new date while this
		// resolves. A bare `revision` bump (coach edited an exercise on the same
		// day) keeps the current crumb — it almost never changes and blanking it
		// would just flicker.
		if (identity !== shownFor) {
			crumb = null;
			onResolved?.(null);
		}

		getBreadcrumb(id, key).then((result) => {
			if (token !== loadToken) return;
			shownFor = identity;
			crumb = result;
			onResolved?.(result);
		});
	});
</script>

{#if crumb}
	<nav class="mb-4 flex flex-wrap items-center gap-1 text-sm">
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
