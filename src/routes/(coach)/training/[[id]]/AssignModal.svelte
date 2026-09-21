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
	// The program list couldn't be fetched — shown instead of a skeleton that
	// would never resolve, and Confirm stays disabled (no program, no assign).
	let programsFailed = $state(false);
	let selectedProgramId = $state('');
	let conflicts = $state<string[] | null>(null);
	// The conflict preview couldn't be fetched — shown instead of a skeleton that
	// would never resolve, and Confirm stays disabled (no preview, no assign).
	let checkFailed = $state(false);
	let totalSessions = $state(0);
	// Set while the assign runs; the modal stays open so a failure can be shown
	// here with the selection intact, rather than after the dialog has gone.
	let assigning = $state(false);
	let assignError = $state('');
	let loadToken = 0;

	const startDate = $derived(program.selectedWeekStart);

	$effect(() => {
		listPrograms()
			.then((list) => {
				programs = list;
				if (list.length > 0 && !selectedProgramId) selectedProgramId = list[0].id;
			})
			.catch(() => (programsFailed = true));
	});

	$effect(() => {
		const id = selectedProgramId;
		const date = startDate;
		if (!id) return;
		conflicts = null;
		checkFailed = false;
		const token = ++loadToken;
		checkAssignConflicts(id, athleteId, date)
			.then((result) => {
				if (token !== loadToken) return;
				totalSessions = result.dates.length;
				conflicts = result.conflicts;
			})
			.catch(() => {
				if (token === loadToken) checkFailed = true;
			});
	});

	async function confirmAssign() {
		if (!selectedProgramId || assigning) return;
		assigning = true;
		assignError = '';
		const res = await assignProgram(selectedProgramId, athleteId, startDate);
		if (!res.ok) {
			assigning = false;
			assignError = res.error || 'Could not assign the program.';
			return;
		}
		// Closes this modal, then refreshes the calendar dots and the visible week.
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

<!-- Esc is ignored while the assign is in flight, so its outcome can't be lost. -->
<dialog
	bind:this={dialog}
	class="modal"
	oncancel={(e) => {
		if (assigning) e.preventDefault();
	}}
	onclose={() => program.closeAssignModal()}
>
	<div class="modal-box">
		<h3 class="mb-4 font-display text-lg font-bold uppercase">Assign program</h3>

		<div class="flex flex-col gap-4 text-sm">
			<p class="text-base-content/60">
				Assigning to <strong class="text-base-content">{athleteName}</strong>, starting the week of
				<strong class="text-base-content">{formatDayMonth(startDate)}</strong> — programs always start
				on a Monday, so this follows whichever week is selected on the calendar.
			</p>

			{#if programsFailed}
				<div class="rounded-lg bg-error/10 p-3 text-error">
					Could not load the program list. Close this dialog and reopen it to try again.
				</div>
			{:else if programs === null}
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

				{#if checkFailed}
					<div class="rounded-lg bg-error/10 p-3 text-error">
						Could not check this schedule for conflicts. Close this dialog and reopen it to try
						again.
					</div>
				{:else if conflicts === null}
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

			{#if assignError}
				<p class="text-xs text-error">{assignError}</p>
			{/if}

			<div class="modal-action">
				<button
					type="button"
					class="btn btn-outline btn-error"
					disabled={assigning}
					onclick={() => program.closeAssignModal()}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn btn-primary"
					disabled={!selectedProgramId || conflicts === null || assigning}
					onclick={confirmAssign}
				>
					{#if assigning}
						<span class="loading loading-xs loading-spinner"></span>
					{/if}
					Confirm assign
				</button>
			</div>
		</div>
	</div>
</dialog>
