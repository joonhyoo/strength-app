<script lang="ts">
	import CheckFillIcon from '@iconify-svelte/mingcute/check-fill';
	import { CATEGORY_ICON } from '$lib/data/categories';
	import type { ExerciseCategory } from '$lib/types';

	let { category, complete = false }: { category: ExerciseCategory; complete?: boolean } = $props();

	const { icon: Icon, color } = $derived(CATEGORY_ICON[category]);
</script>

<div class="rounded-full border p-3 {complete ? 'text-success' : color}">
	{#if complete}
		<CheckFillIcon class="size-6" />
	{:else}
		<Icon class="size-6" />
	{/if}
</div>
