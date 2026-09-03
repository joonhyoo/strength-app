<script lang="ts">
	import PlusFillIcon from '@iconify-svelte/mingcute/plus-fill';
	import { getProgramBuilderState } from '$lib/programBuilderState.svelte';

	const builder = getProgramBuilderState();
</script>

<div class="card h-fit bg-base-100 shadow-sm">
	<div class="card-body">
		<h2 class="card-title font-display text-base uppercase">Programs</h2>

		{#if builder.programs === null}
			<div class="mt-1 flex flex-col gap-2">
				{#each [0, 1, 2] as n (n)}
					<div class="h-9 w-full skeleton"></div>
				{/each}
			</div>
		{:else if builder.programs.length === 0}
			<p class="py-2 text-sm text-base-content/60">No programs yet.</p>
		{:else}
			<div class="flex flex-col gap-1">
				{#each builder.programs as program (program.id)}
					<button
						type="button"
						class="rounded-lg px-3 py-2 text-left text-sm font-medium {builder.selectedProgramId ===
						program.id
							? 'bg-primary/10 text-primary'
							: 'text-base-content/70 hover:bg-base-200'}"
						onclick={() => builder.selectProgram(program.id)}
					>
						{program.name}
					</button>
				{/each}
			</div>
		{/if}

		<button
			type="button"
			class="btn mt-2 border-dashed border-base-300 tracking-wider text-primary uppercase btn-neutral"
			onclick={() => builder.openModal({ type: 'program', programId: null })}
		>
			<PlusFillIcon class="size-4" />
			New program
		</button>
	</div>
</div>
