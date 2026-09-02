<script lang="ts">
	import EditBoxLineIcon from '@iconify-svelte/mingcute/edit-2-line';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import PlusLineIcon from '@iconify-svelte/mingcute/plus-line';
	import Message3LineIcon from '@iconify-svelte/mingcute/message-3-line';
	import DotGridLineIcon from '@iconify-svelte/mingcute/dot-grid-line';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import { getCachedWorkoutDay, getWorkoutDay } from '$lib/services/workoutService.svelte';
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import type { Exercise } from '$lib/types';
	import { CATEGORY_LABEL } from '$lib/data/categories';
	import { formatPlan } from '$lib/formatPlan';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	const program = getCoachProgramState();
	const FLIP_MS = 200;

	let { athleteId, athleteName, date }: { athleteId: string; athleteName: string; date: Date } =
		$props();

	const dateKey = $derived(date.toLocaleDateString('fr-CA'));

	let exercises = $state<Exercise[]>([]);

	// svelte-dnd-action drives the reorder: `consider` streams the live shuffle
	// (siblings flip out of the way), `finalize` commits. The reordered list is
	// applied optimistically; program.reorderExercise then persists and the
	// load $effect reconciles with the server order on the revision bump.
	function handleDndConsider(e: CustomEvent<DndEvent<Exercise>>) {
		exercises = e.detail.items;
	}
	function handleDndFinalize(e: CustomEvent<DndEvent<Exercise>>) {
		exercises = e.detail.items;
		const id = e.detail.info.id;
		const toIndex = exercises.findIndex((x) => x.id === id);
		if (id && toIndex >= 0) program.reorderExercise(id, toIndex);
	}

	let loading = $state(true);
	let loadError = $state(false);
	let loadToken = 0;

	$effect(() => {
		void program.revision;
		const id = athleteId;
		const key = dateKey;
		// Switching athlete/date (or a revision bump) fires overlapping loads;
		// only the newest response may write state.
		const token = ++loadToken;

		const cached = getCachedWorkoutDay(id, key);
		if (cached) {
			exercises = cached;
			loading = false;
		} else {
			// Clear the previous day so the stale list can't leak through — into
			// the "Copy day" disabled state, or a frame where the new date's
			// heading renders above the old day's exercises.
			exercises = [];
			loading = true;
		}
		loadError = false;

		getWorkoutDay(id, key)
			.then((list) => {
				if (token !== loadToken) return;
				exercises = list;
				loading = false;
				program.setDayStatus(key, list);
			})
			.catch(() => {
				if (token !== loadToken) return;
				loading = false;
				if (cached === null) loadError = true;
			});
	});

	async function handleRemove(id: string) {
		await program.removeExercise(id);
	}

	function handleCopyDay() {
		program.copyDay(athleteName);
	}

	async function handlePasteDay() {
		const existingStatus = program.statusMap.get(dateKey);
		if (existingStatus && existingStatus !== 'none') {
			if (
				!confirm(
					`${date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })} already has a workout for ${athleteName}. Pasting will replace it. Continue?`
				)
			)
				return;
		}
		await program.pasteDay();
	}
</script>

<div class="card w-full min-w-0 bg-base-100 shadow-sm">
	<div class="card-body">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="card-title text-base">
				{date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
			</h2>
			<div class="flex shrink-0 gap-2">
				<button
					type="button"
					class="btn btn-sm"
					disabled={exercises.length === 0}
					onclick={handleCopyDay}
				>
					Copy day
				</button>
				<button
					type="button"
					class="btn btn-sm btn-primary"
					disabled={!program.clipboard || program.clipboard.type !== 'day'}
					onclick={handlePasteDay}
				>
					Paste day
				</button>
			</div>
		</div>

		{#if loading}
			<p class="py-6 text-center text-base-content/60">Loading…</p>
		{:else if loadError}
			<p class="py-6 text-center text-base-content/60">Couldn't load this day.</p>
		{:else if exercises.length === 0}
			<p class="py-6 text-center text-base-content/60">No exercises scheduled for this day.</p>
		{:else}
			<div
				class="flex flex-col"
				use:dndzone={{
					items: exercises,
					flipDurationMs: FLIP_MS,
					dragDisabled: exercises.length < 2,
					dropTargetStyle: {}
				}}
				onconsider={handleDndConsider}
				onfinalize={handleDndFinalize}
			>
				{#each exercises as exercise, i (exercise.id)}
					<div class="flex min-w-0 items-center gap-4" animate:flip={{ duration: FLIP_MS }}>
						<div class="flex flex-col items-center self-stretch">
							<span class="w-px flex-1 bg-base-300 {i === 0 ? 'invisible' : ''}"></span>
							<CategoryIcon category={exercise.category} />
							<span class="w-px flex-1 bg-base-300 {i === exercises.length - 1 ? 'invisible' : ''}"
							></span>
						</div>

						<div class="flex min-w-0 flex-1 items-center gap-3 py-1">
							<div class="min-w-0 flex-1">
								{#if exercise.category === 'note'}
									<p class="text-sm break-words text-base-content/80">{exercise.note}</p>
								{:else}
									<div class="flex items-baseline gap-2">
										<span class="font-medium">{exercise.activity}</span>
										<span class="text-xs text-base-content/50"
											>{CATEGORY_LABEL[exercise.category]}</span
										>
									</div>
									{#if formatPlan(exercise.plan) || exercise.note}
										<p class="text-sm break-words text-base-content/60">
											{formatPlan(exercise.plan)}{exercise.plan.length && exercise.note.length
												? ' · '
												: ''}{exercise.note}
										</p>
									{/if}
								{/if}
							</div>
							<div class="flex shrink-0 items-center gap-1">
								{#if exercises.length > 1}
									<span
										class="cursor-grab text-base-content/40 active:cursor-grabbing"
										aria-hidden="true"
									>
										<DotGridLineIcon height="1.2em" />
									</span>
								{/if}
								<button
									class="btn text-secondary btn-ghost btn-xs"
									aria-label={`Edit ${exercise.activity}`}
									onclick={() => exercise.id && program.openEdit(exercise)}
								>
									<EditBoxLineIcon height="1.2em" />
								</button>
								<button
									class="btn text-error btn-ghost btn-xs"
									aria-label={`Remove ${exercise.activity}`}
									onclick={() => exercise.id && handleRemove(exercise.id)}
								>
									<Delete3LineIcon height="1.2em" />
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<div class="mt-2 flex gap-2">
			<button
				class="btn-dashed btn flex-1 border-dashed border-base-300 text-primary"
				onclick={() => program.openModal()}
			>
				<PlusLineIcon height="1.2em" />
				Add exercise
			</button>
			<button
				class="btn-dashed btn border-dashed border-base-300 text-base-content/70"
				onclick={() => program.openModal('note')}
			>
				<Message3LineIcon height="1.2em" />
				Add note
			</button>
		</div>
	</div>
</div>
