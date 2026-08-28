<script lang="ts">
	import ArrowLeftFillIcon from '@iconify-svelte/mingcute/arrow-left-fill';
	import ArrowRightFillIcon from '@iconify-svelte/mingcute/arrow-right-fill';
	import { getWorkoutState } from '$lib/workoutState.svelte';
	import { CONDITIONING_CATEGORIES } from '$lib/complete';

	const workout = getWorkoutState();

	let dialog = $state() as HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
		return () => {
			if (dialog.open) dialog.close();
		};
	});
</script>

{#if workout.selected !== null}
	<dialog bind:this={dialog} class="modal" onclose={() => workout.close()}>
		<div class="modal-box justify-between text-center">
			<h3 class="my-8 text-lg font-bold">{workout.selected.activity}</h3>
			<div class="overflow-x-auto">
				{#if workout.selected.note.length}
					<div class="my-4 rounded-md bg-neutral/20 p-4 whitespace-pre-wrap">
						{workout.selected.note}
					</div>
				{/if}
				{#if !CONDITIONING_CATEGORIES.includes(workout.selected.category)}
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
			<div class="modal-action mb-10 flex-col">
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
				<div class="justify-center">
					<button class="btn btn-ghost" disabled={!workout.hasPrev} onclick={() => workout.prev()}>
						<ArrowLeftFillIcon height="1.5em" />
					</button>
					<button class="btn" onclick={() => workout.close()}>Close</button>
					<button class="btn btn-ghost" disabled={!workout.hasNext} onclick={() => workout.next()}>
						<ArrowRightFillIcon height="1.5em" />
					</button>
				</div>
			</div>
		</div>
	</dialog>
{/if}
