<script lang="ts">
	import { initCoachProgramState } from '$lib/coachProgramState.svelte';
	import CoachSidebar from '$lib/components/CoachSidebar.svelte';
	import MenuLineIcon from '@iconify-svelte/mingcute/menu-line';

	initCoachProgramState();

	let { children } = $props();

	let sidebarOpen = $state(false);
</script>

<div class="flex h-[calc(100dvh-env(safe-area-inset-top))]">
	<CoachSidebar open={sidebarOpen} onclose={() => (sidebarOpen = false)} />

	<div class="grid flex-1 grid-rows-[auto_1fr] overflow-hidden">
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

		<main class="overflow-y-auto overscroll-y-contain px-4">
			{@render children()}
		</main>
	</div>
</div>
