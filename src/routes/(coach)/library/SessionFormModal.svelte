<script lang="ts">
	import { getProgramBuilderState } from '$lib/programBuilderState.svelte';
	import { findSession } from '$lib/programBuilderTree';

	const builder = getProgramBuilderState();

	const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	const modal = $derived(builder.modal);
	const weekId = $derived(modal?.type === 'session' ? modal.weekId : '');
	const dayNumber = $derived(modal?.type === 'session' ? modal.dayNumber : 1);
	const editingSessionId = $derived(modal?.type === 'session' ? modal.sessionId : null);

	const editingSession = $derived(
		editingSessionId
			? (findSession(builder.selectedProgram, editingSessionId)?.session ?? null)
			: null
	);

	let name = $state('');
	let saving = $state(false);
	let error = $state('');

	$effect(() => {
		if (!builder.modal) return;
		name = editingSession?.name ?? '';
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
		if (!trimmed || saving) return;
		// Awaits the server write — the modal stays open (button disabled)
		// until it resolves, closes on success, shows the failure inline.
		saving = true;
		error = '';
		const res = await builder.saveSession(weekId, dayNumber, editingSessionId, trimmed);
		saving = false;
		if (!res.ok) {
			error = res.error ?? 'Could not save the session.';
			return;
		}
		builder.closeModal();
	}
</script>

<dialog bind:this={dialog} class="modal" onclose={() => builder.closeModal()}>
	<div class="modal-box">
		<h3 class="mb-4 font-display text-lg font-bold uppercase">
			{editingSession ? 'Rename session' : 'Add session'}
		</h3>

		<form
			class="flex flex-col gap-4 text-sm"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<p class="text-base-content/60">{DOW[dayNumber - 1]} · this week</p>

			<label class="flex w-full flex-col gap-1.5">
				<span class="label">Session name</span>
				<input
					class="input w-full"
					type="text"
					placeholder="e.g. Lower Body Strength"
					bind:value={name}
				/>
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
					{editingSession ? 'Save' : 'Add session'}
				</button>
			</div>
		</form>
	</div>
</dialog>
