<script lang="ts">
	import { getProgramBuilderState } from '$lib/programBuilderState.svelte';

	const builder = getProgramBuilderState();

	const modal = $derived(builder.modal);
	const editingId = $derived(modal?.type === 'program' ? modal.programId : null);
	const editingProgram = $derived(
		editingId && builder.selectedProgram?.id === editingId ? builder.selectedProgram : null
	);

	let name = $state('');
	let description = $state('');

	$effect(() => {
		if (!builder.modal) return;
		name = editingProgram?.name ?? '';
		description = editingProgram?.description ?? '';
	});

	let saving = $state(false);
	let error = $state('');

	let dialog = $state() as HTMLDialogElement;

	async function submit() {
		const trimmed = name.trim();
		if (!trimmed || saving) return;
		// Awaits the server write — the modal stays open (button disabled)
		// until it resolves, closes on success, shows the failure inline.
		saving = true;
		error = '';
		const res = editingId
			? await builder.updateProgram(editingId, trimmed, description.trim())
			: await builder.createProgram(trimmed, description.trim());
		saving = false;
		if (!res.ok) {
			error = res.error ?? 'Something went wrong — try again.';
			return;
		}
		builder.closeModal();
	}

	$effect(() => {
		dialog.showModal();
		return () => {
			if (dialog.open) dialog.close();
		};
	});
</script>

<dialog bind:this={dialog} class="modal" onclose={() => builder.closeModal()}>
	<div class="modal-box">
		<h3 class="mb-4 font-display text-lg font-bold uppercase">
			{editingProgram ? 'Edit program' : 'New program'}
		</h3>

		<form
			class="flex flex-col gap-4 text-sm"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<label class="flex w-full flex-col gap-1.5">
				<span class="label">Program name</span>
				<input
					class="input w-full"
					type="text"
					placeholder="e.g. 12-Week Strength Program"
					bind:value={name}
				/>
			</label>

			<label class="flex w-full flex-col gap-1.5">
				<span class="label">Description</span>
				<textarea
					class="textarea w-full"
					rows="3"
					placeholder="What is this program for?"
					bind:value={description}
				></textarea>
			</label>

			{#if error}
				<p class="text-sm text-error">{error}</p>
			{/if}

			<div class="modal-action">
				<button
					type="button"
					class="btn btn-outline btn-error"
					disabled={saving}
					onclick={() => builder.closeModal()}
				>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={!name.trim() || saving}>
					{#if saving}
						<span class="loading loading-xs loading-spinner"></span>
					{/if}
					{editingProgram ? 'Save' : 'Create'}
				</button>
			</div>
		</form>
	</div>
</dialog>
