<script lang="ts">
	import ArrowLeftFillIcon from '@iconify-svelte/mingcute/arrow-left-fill';
	import ArrowRightFillIcon from '@iconify-svelte/mingcute/arrow-right-fill';
	import HistoryIcon from '@iconify-svelte/mingcute/history-2-line';
	import CloseFillIcon from '@iconify-svelte/mingcute/close-fill';
	import { getWorkoutState } from '$lib/workoutState.svelte';
	import { CONDITIONING_CATEGORIES } from '$lib/complete';
	import ExerciseHistoryModal from './ExerciseHistoryModal.svelte';

	const workout = getWorkoutState();

	let dialog = $state() as HTMLDialogElement;
	let historyOpen = $state(false);
	let closing = false;

	// Defer showModal() a frame so the browser paints the closed state first —
	// a full-screen box with no transition start otherwise snaps in.
	$effect(() => {
		const raf = requestAnimationFrame(() => dialog.showModal());
		return () => {
			cancelAnimationFrame(raf);
			if (dialog.open) dialog.close();
		};
	});

	/** Drop `[open]` so DaisyUI's `.modal` fade-out plays, then clear the
	 *  selection (which unmounts us) once it's done. */
	function closeModal() {
		if (closing) return;
		closing = true;
		dialog.close();
		setTimeout(() => workout.close(), 250);
	}

	/** prev/next move to a different exercise — the open history view no longer
	 *  matches, so close it as we go. */
	function step(dir: -1 | 1) {
		historyOpen = false;
		if (dir === -1) workout.prev();
		else workout.next();
	}

	const canShowHistory = $derived(
		workout.selected?.category === 'weight' &&
			!!workout.selected.exerciseId &&
			!!workout.location.athleteId
	);

	// Transparent hit target inside the shared pill — only the icon colour
	// reacts to a press, and it eases.
	const navBtn =
		'flex size-12 cursor-pointer items-center justify-center rounded-full text-base-content/80 transition-colors duration-150 active:text-base-content/45 disabled:cursor-default disabled:text-base-content/20';
</script>

{#if workout.selected !== null}
	<dialog
		bind:this={dialog}
		class="modal"
		onclose={closeModal}
		oncancel={(e) => {
			e.preventDefault();
			if (historyOpen) historyOpen = false;
			else closeModal();
		}}
	>
		<div
			class="relative modal-box flex h-full max-h-none w-full max-w-[750px] flex-col overflow-hidden rounded-none px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center sm:pt-8 sm:pb-8 md:border-x md:border-base-300"
			style="scale:1"
		>
			<div class="relative mt-4 mb-8 shrink-0">
				<h3 class="px-10 text-lg font-bold">{workout.selected.activity}</h3>
				{#if canShowHistory}
					<button
						type="button"
						class="btn absolute top-1/2 right-0 btn-circle -translate-y-1/2 btn-ghost"
						aria-label="Previous sessions"
						onclick={() => (historyOpen = true)}
					>
						<HistoryIcon height="1.5em" />
					</button>
				{/if}
			</div>

			<div class="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
				{#if workout.selected.note.length}
					<div
						class="my-4 rounded-md bg-neutral/20 p-4 whitespace-pre-wrap {workout.selected
							.category === 'note'
							? 'text-left'
							: ''}"
					>
						{workout.selected.note}
					</div>
				{/if}
				{#if workout.selected.category === 'weight'}
					<table class="table">
						<thead>
							<tr>
								<th>Sets</th>
								<th>Weight</th>
								<th>Reps</th>
							</tr>
						</thead>
						<tbody>
							{#each workout.selected.performed as set, i (i)}
								<tr>
									<th>{i + 1}</th>
									<td>
										<input
											type="number"
											class="input"
											value={set.weight}
											oninput={(e) => workout.logSet(i, 'weight', e.currentTarget.value)}
											name="weight"
										/>
									</td>
									<td>
										<input
											type="number"
											class="input"
											value={set.reps || workout.selected.plan[i]}
											oninput={(e) => workout.logSet(i, 'reps', e.currentTarget.value)}
											name="reps"
										/>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>

			<div class="modal-action shrink-0 flex-col">
				{#if CONDITIONING_CATEGORIES.includes(workout.selected.category)}
					<div>
						<button
							class={['btn', workout.isComplete(workout.selected) ? 'btn-success' : 'btn-soft']}
							onclick={() => workout.toggleComplete()}
						>
							complete
						</button>
					</div>
				{/if}
				<div class="flex justify-center">
					<div class="flex items-center gap-3 rounded-full bg-base-300 p-1">
						<button
							type="button"
							class={navBtn}
							disabled={!workout.hasPrev}
							aria-label="Previous exercise"
							onclick={() => step(-1)}
						>
							<ArrowLeftFillIcon width="1.4em" height="1.4em" />
						</button>
						<button type="button" class={navBtn} aria-label="Close" onclick={closeModal}>
							<CloseFillIcon width="1.4em" height="1.4em" />
						</button>
						<button
							type="button"
							class={navBtn}
							disabled={!workout.hasNext}
							aria-label="Next exercise"
							onclick={() => step(1)}
						>
							<ArrowRightFillIcon width="1.4em" height="1.4em" />
						</button>
					</div>
				</div>
			</div>

			{#if historyOpen && canShowHistory && workout.selected.exerciseId}
				<ExerciseHistoryModal
					athleteId={workout.location.athleteId}
					exerciseId={workout.selected.exerciseId}
					activity={workout.selected.activity}
					before={workout.location.dateKey}
					onclose={() => (historyOpen = false)}
				/>
			{/if}
		</div>
	</dialog>
{/if}
