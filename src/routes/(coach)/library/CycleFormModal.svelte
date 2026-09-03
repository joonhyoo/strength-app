<script lang="ts">
	import Button from '$lib/components/Button.svelte';
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
	let saving = $state(false);

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

	async function submit() {
		const trimmed = name.trim();
		if (!trimmed) return;
		saving = true;
		await builder.saveCycle(programId, editingCycleId, trimmed, goal.trim(), colorKey);
		saving = false;
	}
</script>

<dialog bind:this={dialog} class="modal" onclose={() => builder.closeModal()}>
	<div class="modal-box">
		<h3 class="mb-4 font-display text-lg font-bold uppercase">
			{editingCycle ? 'Edit cycle' : 'Add cycle'}
		</h3>

		<form
			class="flex flex-col gap-4"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<label class="form-control w-full">
				<span class="label">Cycle name</span>
				<input class="input" type="text" placeholder="e.g. Strength Cycle" bind:value={name} />
			</label>

			<label class="form-control w-full">
				<span class="label">Goal</span>
				<input
					class="input"
					type="text"
					placeholder="What is this cycle building toward?"
					bind:value={goal}
				/>
			</label>

			<div class="flex flex-col gap-2">
				<span class="label px-0">Color</span>
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
				<p class="text-xs text-base-content/50">
					A new cycle starts with no weeks — use the + chip on its week row to add some.
				</p>
			{/if}

			<div class="modal-action">
				<Button variant="destructive" onclick={() => builder.closeModal()}>Cancel</Button>
				<Button variant="primary" type="submit" disabled={saving || !name.trim()}>
					{editingCycle ? 'Save' : 'Add cycle'}
				</Button>
			</div>
		</form>
	</div>
</dialog>
