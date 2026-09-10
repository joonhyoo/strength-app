<script lang="ts">
	import AddFillIcon from '@iconify-svelte/mingcute/add-fill';
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import { checkShiftConflicts, shiftSchedule } from '$lib/services/programTemplateService.svelte';
	import { formatDayMonth } from '$lib/dateKey';

	let { athleteId, athleteName }: { athleteId: string; athleteName: string } = $props();

	const program = getCoachProgramState();

	// Matches the athlete workout modal's ghost nav-button treatment
	// (train/WorkoutModal.svelte's navBtn) — color-only feedback, no
	// border or background, so it stays consistent across the app.
	const stepBtn =
		'flex size-9 cursor-pointer items-center justify-center rounded-full text-base-content/80 transition-colors duration-150 active:text-base-content/45';

	let shiftWeeks = $state(1);
	let moving = $state<string[] | null>(null);
	let conflicts = $state<string[]>([]);
	let loadToken = 0;

	const fromDate = $derived(program.selectedWeekStart);

	// Direction-aware intro copy — a negative shift's destination dates land
	// before fromDate, inside the "earlier weeks" a forward shift leaves
	// alone, so it gets its own warning instead of the blanket claim.
	const directionNote = $derived.by(() => {
		if (shiftWeeks > 0) {
			return `, later by ${shiftWeeks} week${shiftWeeks === 1 ? '' : 's'}. Earlier weeks are untouched.`;
		}
		if (shiftWeeks < 0) {
			const n = Math.abs(shiftWeeks);
			return `, earlier by ${n} week${n === 1 ? '' : 's'} — this can overwrite sessions already scheduled on those earlier dates.`;
		}
		return '.';
	});

	// Works whether or not the athlete has a formal program assignment — it
	// moves whatever's actually scheduled from fromDate onward, hand-written
	// days included. A zero-week shift is a no-op (Confirm is disabled for
	// it below) — skip the fetch rather than ask the server to evaluate
	// moving every session onto its own current date. Deliberately does NOT
	// blank `moving` before the fetch resolves — the stepper's own +/-
	// buttons trigger this on every click, and clearing it first flashed the
	// skeleton in and out on each one. The stale result sits for one round
	// trip (near-instant locally) instead, then the token guard swaps it.
	$effect(() => {
		const date = fromDate;
		const weeks = shiftWeeks;
		if (weeks === 0) return;
		const token = ++loadToken;
		checkShiftConflicts(athleteId, date, weeks).then((result) => {
			if (token !== loadToken || !result) return;
			moving = result.moving;
			conflicts = result.conflicts;
		});
	});

	// Zero is skipped entirely in either direction — a same-week "shift" is a
	// no-op, so there's nothing useful to land on there.
	function decrementWeeks() {
		shiftWeeks = shiftWeeks - 1 === 0 ? -1 : shiftWeeks - 1;
	}
	function incrementWeeks() {
		shiftWeeks = shiftWeeks + 1 === 0 ? 1 : shiftWeeks + 1;
	}

	async function confirmShift() {
		if (shiftWeeks === 0) return;
		// Close now; the calendar + timeline refresh once the server has moved the
		// sessions, or show an inline error if it couldn't.
		program.closeShiftModal();
		const res = await shiftSchedule(athleteId, fromDate, shiftWeeks);
		if (res.ok) await program.onScheduleChanged();
		else program.opError = res.error || 'Could not shift the schedule.';
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

		<div class="flex flex-col gap-4 text-sm">
			<p class="text-base-content/60">
				Moves <strong class="text-base-content">{athleteName}</strong>'s schedule from the week of
				<strong class="text-base-content">{formatDayMonth(fromDate)}</strong> onward{directionNote}
			</p>

			<label class="flex w-full flex-col gap-1.5">
				<span class="label">Shift by (weeks — negative moves it earlier)</span>
				<div class="flex items-center justify-center gap-4">
					<button
						type="button"
						class={stepBtn}
						aria-label="Decrease weeks"
						onclick={decrementWeeks}
					>
						<span class="block h-1 w-4 rounded-full bg-current" aria-hidden="true"></span>
					</button>
					<input class="input w-20 text-center" type="number" step="1" bind:value={shiftWeeks} />
					<button
						type="button"
						class={stepBtn}
						aria-label="Increase weeks"
						onclick={incrementWeeks}
					>
						<AddFillIcon class="size-4" />
					</button>
				</div>
			</label>

			{#if shiftWeeks !== 0}
				{#if moving === null}
					<div class="h-14 w-full skeleton"></div>
				{:else if moving.length === 0}
					<div class="rounded-lg bg-warning/15 p-3">
						Nothing scheduled from this week onward for {athleteName} — nothing to shift.
					</div>
				{:else if conflicts.length === 0}
					<div class="rounded-lg bg-success/10 p-3">
						Ready — <strong>{moving.length}</strong> session{moving.length === 1 ? '' : 's'} will move
						{shiftWeeks >= 0 ? 'later' : 'earlier'} by {Math.abs(shiftWeeks)} week{Math.abs(
							shiftWeeks
						) === 1
							? ''
							: 's'}.
					</div>
				{:else}
					<div class="rounded-lg bg-warning/15 p-3">
						<strong>{conflicts.length}</strong> date{conflicts.length === 1 ? '' : 's'} already {conflicts.length ===
						1
							? 'has'
							: 'have'} a workout that will be <strong>replaced</strong>:
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
					onclick={() => program.closeShiftModal()}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn btn-primary"
					disabled={shiftWeeks === 0 || moving === null || moving.length === 0}
					onclick={confirmShift}
				>
					Confirm shift
				</button>
			</div>
		</div>
	</div>
</dialog>
