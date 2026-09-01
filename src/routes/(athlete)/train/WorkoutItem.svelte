<script lang="ts">
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import type { ExerciseCategory } from '$lib/types';
	import { formatPlan } from '$lib/formatPlan';

	let {
		category,
		activity,
		plan,
		note = '',
		complete,
		onselect
	} = $props<{
		category: ExerciseCategory;
		activity: string;
		plan: number[];
		note?: string;
		complete: boolean;
		onselect: () => void;
	}>();

	// For a note the plan is empty; show a one-line preview of the text instead
	// (the full note opens in the dialog on tap).
	const subtitle = $derived(category === 'note' ? note : formatPlan(plan));
</script>

<button
	class="flex w-full items-center gap-4 rounded-lg p-2 transition-opacity ease-in-out hover:cursor-pointer active:opacity-50"
	onclick={onselect}
>
	<CategoryIcon {category} {complete} />
	<div class="min-w-0 text-left leading-tight">
		<h2 class="text-lg">{activity}</h2>
		<span class="block truncate text-sm">{subtitle}</span>
	</div>
</button>
