<script lang="ts">
	import { getProgramBuilderState } from '$lib/programBuilderState.svelte';
	import { CYCLE_COLORS, DEFAULT_CYCLE_COLOR } from '$lib/data/cycleColors';
	import type { ColorKey } from '$lib/types';

	const builder = getProgramBuilderState();

	const modal = $derived(builder.modal);
	const programId = $derived(modal?.type === 'cycle' ? modal.programId : '');
	const editingCycleId = $derived(modal?.type === 'cycle' ? modal.cycleId : null);
	const editingCycle = $derived(
		editingCycleId
			? (builder.selectedProgram?.cycles.find((c) => c.id === editingCycleId) ?? null)
			: null
	);

	let name = $state('');
	let goal = $state('');
	let colorKey = $state<ColorKey>(DEFAULT_CYCLE_COLOR);

	$effect(() => {
		if (!builder.modal) return;
		name = editingCycle?.name ?? '';
		goal = editingCycle?.goal ?? '';
		colorKey = editingCycle?.colorKey ?? DEFAULT_CYCLE_COLOR;
	});

	let dialog = $state() as HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
		return () => {
			if (dialog.open) dialog.close();
		};
	});

	function submit() {
		const trimmed = name.trim();
		if (!trimmed) return;
		// Applies optimistically and closes this modal itself.
		builder.saveCycle(programId, editingCycleId, trimmed, goal.trim(), colorKey);
	}
</script>

<dialog bind:this={dialog} class="modal" onclose={() => builder.closeModal()}>
	<div class="modal-box">
		<h3 class="mb-4 font-display text-lg font-bold uppercase">
			{editingCycle ? 'Edit cycle' : 'Add cycle'}
		</h3>

		<form
			class="flex flex-col gap-4 text-sm"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<label class="flex w-full flex-col gap-1.5">
				<span class="label">Cycle name</span>
				<input
					class="input w-full"
					type="text"
					placeholder="e.g. Strength Cycle"
					bind:value={name}
				/>
			</label>

			<label class="flex w-full flex-col gap-1.5">
				<span class="label">Goal</span>
				<input
					class="input w-full"
					type="text"
					placeholder="What is this cycle building toward?"
					bind:value={goal}
				/>
			</label>

			<div class="flex w-full flex-col gap-1.5">
				<span class="label">Color</span>
				<div class="flex flex-wrap gap-2">
					{#each CYCLE_COLORS as option (option.key)}
						<button
							type="button"
							class="h-8 w-8 rounded-full border-2 {colorKey === option.key
								? 'border-base-content'
								: 'border-transparent'}"
							style="background:{option.css}"
							aria-pressed={colorKey === option.key}
							aria-label={option.key}
							onclick={() => (colorKey = option.key)}
						></button>
					{/each}
				</div>
			</div>

			{#if !editingCycle}
				<p class="text-xs text-base-content/60">
					A new cycle starts with no weeks — use the + chip on its week row to add some.
				</p>
			{/if}

			<div class="modal-action">
				<button
					type="button"
					class="btn btn-outline btn-error"
					onclick={() => builder.closeModal()}
				>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={!name.trim()}>
					{editingCycle ? 'Save' : 'Add cycle'}
				</button>
			</div>
		</form>
	</div>
</dialog>
