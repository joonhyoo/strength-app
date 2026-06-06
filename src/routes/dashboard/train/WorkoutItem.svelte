<script lang="ts">
	import FireLineIcon from '@iconify-svelte/mingcute/fire-line';
	import HeartbeatLineIcon from '@iconify-svelte/mingcute/heartbeat-line';
	import BarbellLineIcon from '@iconify-svelte/mingcute/barbell-line';
	import type { ExerciseCategory } from './types';
	const iconMap = {
		warmup: { icon: FireLineIcon, color: 'text-red-400' },
		plyo: { icon: HeartbeatLineIcon, color: 'text-yellow-400' },
		weight: { icon: BarbellLineIcon, color: 'text-blue-400' }
	};
	let { category, title, prescription } = $props<{
		category: ExerciseCategory;
		title: string;
		prescription: number[];
	}>();
	let { icon: Icon, color } = $derived(iconMap[category as ExerciseCategory]);
</script>

<button
	class="flex w-full items-center gap-4 rounded-lg p-2 transition-opacity ease-in-out hover:opacity-50 focus:opacity-50"
	onclick={() => console.log('opened', title, prescription)}
>
	<div class="rounded-full border p-3 {color}">
		<Icon height="1.4em" />
	</div>
	<div class="text-left leading-tight">
		<h2 class="text-lg">{title}</h2>
		<span class="text-sm">
			{prescription.join(', ')}
		</span>
	</div>
</button>
