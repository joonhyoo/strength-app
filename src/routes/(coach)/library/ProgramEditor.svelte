<script lang="ts">
	import PlusFillIcon from '@iconify-svelte/mingcute/plus-fill';
	import EditBoxLineIcon from '@iconify-svelte/mingcute/edit-2-line';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import { getProgramBuilderState } from '$lib/programBuilderState.svelte';
	import CycleBand from './CycleBand.svelte';

	const builder = getProgramBuilderState();

	async function handleDeleteProgram(programId: string, name: string) {
		if (
			!confirm(
				`Delete "${name}"? This deletes every cycle, week, and session in it. Athletes already on this program keep their scheduled days — they just lose the program label.`
			)
		)
			return;
		await builder.deleteProgram(programId);
	}
</script>

{#if builder.selectedProgram}
	{@const program = builder.selectedProgram}
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0">
			<div class="flex items-center gap-1">
				<h2 class="font-display text-xl font-bold uppercase">{program.name}</h2>
				<button
					type="button"
					class="btn btn-ghost btn-xs"
					aria-label="Edit program name and description"
					onclick={() => builder.openModal({ type: 'program', programId: program.id })}
				>
					<EditBoxLineIcon class="size-4" />
				</button>
				<button
					type="button"
					class="btn text-error btn-ghost btn-xs"
					aria-label="Delete program"
					onclick={() => handleDeleteProgram(program.id, program.name)}
				>
					<Delete3LineIcon class="size-4" />
				</button>
			</div>
			{#if program.description}
				<p class="mt-1 max-w-prose text-sm text-base-content/60">{program.description}</p>
			{/if}
		</div>
	</div>

	<div class="mt-4 flex flex-col gap-4">
		{#if program.cycles.length === 0}
			<p class="py-6 text-center text-base-content/60">
				No cycles yet — a program needs at least one cycle to organize its weeks.
			</p>
		{:else}
			{#each program.cycles as cycle (cycle.id)}
				<CycleBand {cycle} />
			{/each}
		{/if}
		<button
			type="button"
			class="btn border-dashed border-base-300 tracking-wider text-primary uppercase btn-neutral"
			onclick={() => builder.openModal({ type: 'cycle', programId: program.id, cycleId: null })}
		>
			<PlusFillIcon class="size-4" />
			Add cycle
		</button>
	</div>
{:else}
	<div class="card bg-base-100 shadow-sm">
		<div class="card-body items-center py-16 text-center">
			<p class="text-base-content/60">Select a program, or create a new one to get started.</p>
		</div>
	</div>
{/if}

{#if builder.modal?.type === 'program'}
	{#await import('./ProgramFormModal.svelte') then { default: ProgramFormModal }}
		<ProgramFormModal />
	{/await}
{/if}
{#if builder.modal?.type === 'cycle'}
	{#await import('./CycleFormModal.svelte') then { default: CycleFormModal }}
		<CycleFormModal />
	{/await}
{/if}
{#if builder.modal?.type === 'session'}
	{#await import('./SessionFormModal.svelte') then { default: SessionFormModal }}
		<SessionFormModal />
	{/await}
{/if}
{#if builder.modal?.type === 'exercise'}
	{#await import('./ProgramExerciseModal.svelte') then { default: ProgramExerciseModal }}
		<ProgramExerciseModal />
	{/await}
{/if}
