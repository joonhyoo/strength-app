<script lang="ts">
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import {
		listPrograms,
		checkAssignConflicts,
		assignProgram
	} from '$lib/services/programTemplateService.svelte';
	import type { ProgramSummary } from '$lib/services/programTemplateService.svelte';
	import { formatDayMonth } from '$lib/dateKey';

	let { athleteId, athleteName }: { athleteId: string; athleteName: string } = $props();

	const program = getCoachProgramState();

	let programs = $state<ProgramSummary[] | null>(null);
	let selectedProgramId = $state('');
	let conflicts = $state<string[] | null>(null);
	let totalSessions = $state(0);
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
		// Close now; the calendar + timeline refresh once the server has built the
		// schedule, or show an inline error if it couldn't.
		program.closeAssignModal();
		const res = await assignProgram(selectedProgramId, athleteId, startDate);
		if (res.ok) await program.onScheduleChanged();
		else program.opError = res.error || 'Could not assign the program.';
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

		<div class="flex flex-col gap-4 text-sm">
			<p class="text-base-content/60">
				Assigning to <strong class="text-base-content">{athleteName}</strong>, starting the week of
				<strong class="text-base-content">{formatDayMonth(startDate)}</strong> — programs always start
				on a Monday, so this follows whichever week is selected on the calendar.
			</p>

			{#if programs === null}
				<div class="h-10 w-full skeleton"></div>
			{:else if programs.length === 0}
				<p class="text-base-content/60">No programs yet — build one in the Library first.</p>
			{:else}
				<label class="flex w-full flex-col gap-1.5">
					<span class="label">Program</span>
					<select class="select w-full" bind:value={selectedProgramId}>
						{#each programs as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</label>

				{#if conflicts === null}
					<div class="h-14 w-full skeleton"></div>
				{:else if conflicts.length === 0}
					<div class="rounded-lg bg-success/10 p-3">
						Ready to assign — <strong>{totalSessions}</strong> session{totalSessions === 1
							? ''
							: 's'}
						will be scheduled starting {formatDayMonth(startDate)}.
					</div>
				{:else}
					<div class="rounded-lg bg-warning/15 p-3">
						<strong>{conflicts.length}</strong> date{conflicts.length === 1 ? '' : 's'} already {conflicts.length ===
						1
							? 'has'
							: 'have'} a workout for {athleteName} — assigning will <strong>replace</strong>
						{conflicts.length === 1 ? 'it' : 'them'}:
						<ul class="mt-1 list-disc pl-5">
							{#each conflicts as dateKey (dateKey)}
								<li>{formatDayMonth(dateKey)}</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}

			<div class="modal-action">
				<button
					type="button"
					class="btn btn-outline btn-error"
					onclick={() => program.closeAssignModal()}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn btn-primary"
					disabled={!selectedProgramId || conflicts === null}
					onclick={confirmAssign}
				>
					Confirm assign
				</button>
			</div>
		</div>
	</div>
</dialog>
