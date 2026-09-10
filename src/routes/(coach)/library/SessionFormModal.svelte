<script lang="ts">
	import { getProgramBuilderState } from '$lib/programBuilderState.svelte';

	const builder = getProgramBuilderState();

	const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	const modal = $derived(builder.modal);
	const weekId = $derived(modal?.type === 'session' ? modal.weekId : '');
	const dayNumber = $derived(modal?.type === 'session' ? modal.dayNumber : 1);
	const editingSessionId = $derived(modal?.type === 'session' ? modal.sessionId : null);

	const editingSession = $derived.by(() => {
		if (!editingSessionId || !builder.selectedProgram) return null;
		for (const cycle of builder.selectedProgram.cycles) {
			for (const week of cycle.weeks) {
				const session = week.sessions.find((s) => s.id === editingSessionId);
				if (session) return session;
			}
		}
		return null;
	});

	let name = $state('');

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

	function submit() {
		const trimmed = name.trim();
		if (!trimmed) return;
		// Applies optimistically and closes this modal itself.
		builder.saveSession(weekId, dayNumber, editingSessionId, trimmed);
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

			<div class="modal-action">
				<button
					type="button"
					class="btn btn-outline btn-error"
					onclick={() => builder.closeModal()}
				>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={!name.trim()}>
					{editingSession ? 'Save' : 'Add session'}
				</button>
			</div>
		</form>
	</div>
</dialog>
