<script lang="ts">
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import {
		listPrograms,
		checkAssignConflicts,
		assignProgram
	} from '$lib/services/programTemplateService.svelte';
	import type { ProgramSummary } from '$lib/services/programTemplateService.svelte';

	let { athleteId, athleteName }: { athleteId: string; athleteName: string } = $props();

	const program = getCoachProgramState();

	function parseKey(key: string) {
		const [y, m, d] = key.split('-').map(Number);
		return new Date(y, m - 1, d);
	}
	function formatShort(key: string) {
		return parseKey(key).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
	}

	let programs = $state<ProgramSummary[] | null>(null);
	let selectedProgramId = $state('');
	let conflicts = $state<string[] | null>(null);
	let totalSessions = $state(0);
	let submitting = $state(false);
	let loadToken = 0;

	const startDate = $derived(program.selectedWeekStart);

	$effect(() => {
		listPrograms().then((list) => {
			programs = list;
			if (list.length > 0 && !selectedProgramId) selectedProgramId = list[0].id;
		});
	});

	$effect(() => {
		const id = selectedProgramId;
		const date = startDate;
		if (!id) return;
		conflicts = null;
		const token = ++loadToken;
		checkAssignConflicts(id, athleteId, date).then((result) => {
			if (token !== loadToken || !result) return;
			totalSessions = result.dates.length;
			conflicts = result.conflicts;
		});
	});

	async function confirmAssign() {
		if (!selectedProgramId) return;
		submitting = true;
		await assignProgram(selectedProgramId, athleteId, startDate);
		submitting = false;
		await program.onScheduleChanged();
	}

	let dialog = $state() as HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
		return () => {
			if (dialog.open) dialog.close();
		};
	});
</script>

<dialog bind:this={dialog} class="modal" onclose={() => program.closeAssignModal()}>
	<div class="modal-box">
		<h3 class="mb-4 font-display text-lg font-bold uppercase">Assign program</h3>

		<p class="mb-4 text-sm text-base-content/60">
			Assigning to <strong class="text-base-content">{athleteName}</strong>, starting the week of
			<strong class="text-base-content">{formatShort(startDate)}</strong> — programs always start on a
			Monday, so this follows whichever week is selected on the calendar.
		</p>

		{#if programs === null}
			<div class="h-10 w-full skeleton"></div>
		{:else if programs.length === 0}
			<p class="text-sm text-base-content/60">No programs yet — build one in the Library first.</p>
		{:else}
			<label class="form-control mb-4 w-full">
				<span class="label">Program</span>
				<select class="select" bind:value={selectedProgramId}>
					{#each programs as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</label>

			{#if conflicts === null}
				<div class="h-14 w-full skeleton"></div>
			{:else if conflicts.length === 0}
				<div class="rounded-lg bg-success/10 p-3 text-sm">
					Ready to assign — <strong>{totalSessions}</strong> session{totalSessions === 1 ? '' : 's'} will
					be scheduled starting {formatShort(startDate)}.
				</div>
			{:else}
				<div class="rounded-lg bg-warning/15 p-3 text-sm">
					<strong>{conflicts.length}</strong> date{conflicts.length === 1 ? '' : 's'} already {conflicts.length ===
					1
						? 'has'
						: 'have'} a workout for {athleteName} — assigning will <strong>replace</strong>
					{conflicts.length === 1 ? 'it' : 'them'}:
					<ul class="mt-1 list-disc pl-5">
						{#each conflicts as dateKey (dateKey)}
							<li>{formatShort(dateKey)}</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}

		<div class="modal-action">
			<button
				type="button"
				class="btn bg-error/10 text-error hover:bg-error/20"
				onclick={() => program.closeAssignModal()}
			>
				Cancel
			</button>
			<button
				type="button"
				class="btn btn-primary"
				disabled={!selectedProgramId || conflicts === null || submitting}
				onclick={confirmAssign}
			>
				Confirm assign
			</button>
		</div>
	</div>
</dialog>
