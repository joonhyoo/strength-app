<script lang="ts">
	import { initCoachProgramState } from '$lib/coachProgramState.svelte';
	import { seedExerciseLibrary } from '$lib/data/exerciseLibrary.svelte';
	import CoachSidebar from '$lib/components/CoachSidebar.svelte';
	import MenuLineIcon from '@iconify-svelte/mingcute/menu-line';
	import type { LayoutProps } from './$types';

	initCoachProgramState();

	let { data, children }: LayoutProps = $props();

	// The catalog every coach page and modal reads. Seeded here, once, from the
	// layout's streamed load — a page seeding its own (differently-shaped) copy is
	// how rows once ended up without ids or video links.
	$effect(() => {
		data.exercises.then(seedExerciseLibrary);
	});

	let sidebarOpen = $state(false);
</script>

<div class="flex h-[calc(100dvh-env(safe-area-inset-top))]">
	<CoachSidebar open={sidebarOpen} onclose={() => (sidebarOpen = false)} />

	<div class="grid flex-1 grid-rows-[auto_1fr] lg:overflow-hidden">
		<header class="border-b bg-base-100 lg:hidden">
			<div class="flex items-center px-4 py-3">
				<button
					type="button"
					class="btn btn-square btn-ghost btn-sm"
					aria-label="Open navigation"
					onclick={() => (sidebarOpen = true)}
				>
					<MenuLineIcon class="size-6" />
				</button>
			</div>
		</header>

		<main class="flex flex-col overflow-y-auto px-4 lg:overflow-hidden">
			{@render children()}
		</main>
	</div>
</div>
