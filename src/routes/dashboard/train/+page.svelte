<script lang="ts">
	import LeftFillIcon from '@iconify-svelte/mingcute/left-fill';
	import RightFillIcon from '@iconify-svelte/mingcute/right-fill';
	import type { Exercise } from './types';
	import WorkoutItem from './WorkoutItem.svelte';
	const exercises: Exercise[] = [
		{
			category: 'warmup',
			title: 'Jumping Warmup',
			prescription: []
		},
		{
			category: 'plyo',
			title: 'Depth Drops',
			prescription: [3, 3, 3]
		},
		{
			category: 'weight',
			title: 'Barbell Back Squat',
			prescription: [6, 6, 6, 6]
		},
		{
			category: 'weight',
			title: 'Romanian Deadlift',
			prescription: [6, 6, 6, 6]
		},
		{
			category: 'weight',
			title: 'Smith Machine Calfe Raise',
			prescription: [6, 6, 6, 6]
		}
	];
</script>

<header class="my-4 flex w-full items-center justify-center gap-4 border-b py-4">
	<button class="btn btn-ghost"><LeftFillIcon height="1.5em" /></button>
	<span>Day, Month XX, 20XX</span>
	<button class="btn btn-ghost"><RightFillIcon height="1.5em" /></button>
</header>

<h2 class="text-lg font-bold">Scheduled Workout</h2>
<ol>
	{#each exercises as exercise}
		<li class="py-2">
			<WorkoutItem
				category={exercise.category}
				title={exercise.title}
				prescription={exercise.prescription}
			/>
		</li>
	{/each}
</ol>
