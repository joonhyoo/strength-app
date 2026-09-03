<script lang="ts">
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import { checkShiftConflicts, shiftSchedule } from '$lib/services/programTemplateService.svelte';

	let { athleteId, athleteName }: { athleteId: string; athleteName: string } = $props();

	const program = getCoachProgramState();

	function parseKey(key: string) {
		const [y, m, d] = key.split('-').map(Number);
		return new Date(y, m - 1, d);
	}
	function formatShort(key: string) {
		return parseKey(key).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
	}

	let shiftWeeks = $state(1);
	let moving = $state<string[] | null>(null);
	let conflicts = $state<string[]>([]);
	let submitting = $state(false);
	let loadToken = 0;

	const fromDate = $derived(program.selectedWeekStart);

	// Works whether or not the athlete has a formal program assignment — it
	// moves whatever's actually scheduled from fromDate onward, hand-written
	// days included.
	$effect(() => {
		const date = fromDate;
		const weeks = shiftWeeks;
		moving = null;
		const token = ++loadToken;
		checkShiftConflicts(athleteId, date, weeks).then((result) => {
			if (token !== loadToken || !result) return;
			moving = result.moving;
			conflicts = result.conflicts;
		});
	});

	async function confirmShift() {
		if (shiftWeeks === 0) return;
		submitting = true;
		await shiftSchedule(athleteId, fromDate, shiftWeeks);
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

<dialog bind:this={dialog} class="modal" onclose={() => program.closeShiftModal()}>
	<div class="modal-box">
		<h3 class="mb-4 font-display text-lg font-bold uppercase">Shift schedule</h3>

		<p class="mb-4 text-sm text-base-content/60">
			Moves <strong class="text-base-content">{athleteName}</strong>'s schedule from the week of
			<strong class="text-base-content">{formatShort(fromDate)}</strong> onward. Earlier weeks are untouched.
		</p>

		<label class="form-control mb-4 w-full">
			<span class="label">Shift by (weeks — negative moves it earlier)</span>
			<input class="input" type="number" step="1" bind:value={shiftWeeks} />
		</label>

		{#if moving === null}
			<div class="h-14 w-full skeleton"></div>
		{:else if moving.length === 0}
			<div class="rounded-lg bg-warning/15 p-3 text-sm">
				Nothing scheduled from this week onward for {athleteName} — nothing to shift.
			</div>
		{:else if conflicts.length === 0}
			<div class="rounded-lg bg-success/10 p-3 text-sm">
				Ready — <strong>{moving.length}</strong> session{moving.length === 1 ? '' : 's'} will move
				{shiftWeeks >= 0 ? 'later' : 'earlier'} by {Math.abs(shiftWeeks)} week{Math.abs(
					shiftWeeks
				) === 1
					? ''
					: 's'}.
			</div>
		{:else}
			<div class="rounded-lg bg-warning/15 p-3 text-sm">
				<strong>{conflicts.length}</strong> date{conflicts.length === 1 ? '' : 's'} already {conflicts.length ===
				1
					? 'has'
					: 'have'} a workout that will be <strong>replaced</strong>:
				<ul class="mt-1 list-disc pl-5">
					{#each conflicts as dateKey (dateKey)}
						<li>{formatShort(dateKey)}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="modal-action">
			<button
				type="button"
				class="btn border border-error bg-transparent tracking-wider text-error uppercase hover:bg-error/10"
				onclick={() => program.closeShiftModal()}
			>
				Cancel
			</button>
			<button
				type="button"
				class="btn tracking-wider uppercase btn-primary"
				disabled={shiftWeeks === 0 || moving === null || moving.length === 0 || submitting}
				onclick={confirmShift}
			>
				Confirm shift
			</button>
		</div>
	</div>
</dialog>
