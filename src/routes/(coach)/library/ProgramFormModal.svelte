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
	let saving = $state(false);

	$effect(() => {
		if (!builder.modal) return;
		name = editingProgram?.name ?? '';
		description = editingProgram?.description ?? '';
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
		if (editingId) {
			await builder.updateProgram(editingId, trimmed, description.trim());
		} else {
			await builder.createProgram(trimmed, description.trim());
		}
		saving = false;
	}
</script>

<dialog bind:this={dialog} class="modal" onclose={() => builder.closeModal()}>
	<div class="modal-box">
		<h3 class="mb-4 font-display text-lg font-bold uppercase">
			{editingProgram ? 'Edit program' : 'New program'}
		</h3>

		<form
			class="flex flex-col gap-4"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<label class="form-control w-full">
				<span class="label">Program name</span>
				<input
					class="input"
					type="text"
					placeholder="e.g. 12-Week Strength Program"
					bind:value={name}
				/>
			</label>

			<label class="form-control w-full">
				<span class="label">Description</span>
				<textarea
					class="textarea"
					rows="3"
					placeholder="What is this program for?"
					bind:value={description}
				></textarea>
			</label>

			<div class="modal-action">
				<button
					type="button"
					class="btn bg-error/10 tracking-wider text-error uppercase hover:bg-error/20"
					onclick={() => builder.closeModal()}
				>
					Cancel
				</button>
				<button
					class="btn tracking-wider uppercase btn-primary"
					type="submit"
					disabled={saving || !name.trim()}
				>
					{editingProgram ? 'Save' : 'Create'}
				</button>
			</div>
		</form>
	</div>
</dialog>
