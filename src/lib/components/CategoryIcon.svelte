<script lang="ts">
	import FireLineIcon from '@iconify-svelte/mingcute/fire-line';
	import HeartbeatLineIcon from '@iconify-svelte/mingcute/heartbeat-line';
	import BarbellLineIcon from '@iconify-svelte/mingcute/barbell-line';
	import CheckFillIcon from '@iconify-svelte/mingcute/check-fill';
	import ReapeatFillIcon from '@iconify-svelte/mingcute/repeat-fill';
	import type { ExerciseCategory } from '$lib/types';

	const iconMap: Record<ExerciseCategory, { icon: typeof FireLineIcon; color: string }> = {
		warmup: { icon: FireLineIcon, color: 'text-danger' },
		circuit: { icon: ReapeatFillIcon, color: 'text-lime' },
		plyo: { icon: HeartbeatLineIcon, color: 'text-sky' },
		weight: { icon: BarbellLineIcon, color: 'text-primary' }
	};

	let { category, complete = false }: { category: ExerciseCategory; complete?: boolean } = $props();

	const { icon: Icon, color } = $derived(iconMap[category]);
</script>

<div class="rounded-full border p-3 {complete ? 'text-success' : color}">
	{#if complete}
		<CheckFillIcon height="1.4em" />
	{:else}
		<Icon height="1.4em" />
	{/if}
</div>
