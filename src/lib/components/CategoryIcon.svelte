<script lang="ts">
	import CheckFillIcon from '@iconify-svelte/mingcute/check-fill';
	import { CATEGORY_ICON } from '$lib/data/categories';
	import type { ExerciseCategory } from '$lib/types';

	let {
		category,
		complete = false,
		size = 'md'
	}: { category: ExerciseCategory; complete?: boolean; size?: 'md' | 'sm' } = $props();

	const { icon: Icon, color } = $derived(CATEGORY_ICON[category]);
	const wrapperClass = $derived(
		size === 'sm'
			? `rounded-full p-2 ${complete ? 'text-success' : color}`
			: `rounded-full border p-3 ${complete ? 'text-success' : color}`
	);
	const iconClass = $derived(size === 'sm' ? 'size-5' : 'size-6');
</script>

<div class={wrapperClass}>
	{#if complete}
		<CheckFillIcon class={iconClass} />
	{:else}
		<Icon class={iconClass} />
	{/if}
</div>
