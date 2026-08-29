<script lang="ts">
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import type { ExerciseCategory } from '$lib/types';
	import { formatPlan } from '$lib/formatPlan';

	let { category, activity, plan, complete, onselect } = $props<{
		category: ExerciseCategory;
		activity: string;
		plan: number[];
		complete: boolean;
		onselect: () => void;
	}>();
</script>

<button
	class="flex w-full items-center gap-4 rounded-lg p-2 transition-opacity ease-in-out hover:cursor-pointer active:opacity-50"
	onclick={onselect}
>
	<CategoryIcon {category} {complete} />
	<div class="text-left leading-tight">
		<h2 class="text-lg">{activity}</h2>
		<span class="text-sm">{formatPlan(plan)}</span>
	</div>
</button>
