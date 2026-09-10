<script lang="ts">
	import EditBoxLineIcon from '@iconify-svelte/mingcute/edit-2-line';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import DotGridLineIcon from '@iconify-svelte/mingcute/dot-grid-line';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import { CATEGORY_LABEL } from '$lib/data/categories';
	import { formatPlan } from '$lib/formatPlan';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { SvelteSet } from 'svelte/reactivity';
	import type { ProgramExerciseDetail } from '$lib/types';

	let {
		exercises,
		pendingExerciseIds,
		onReorder,
		onEdit,
		onRemove
	}: {
		exercises: ProgramExerciseDetail[];
		pendingExerciseIds: SvelteSet<string>;
		onReorder: (programExerciseId: string, toIndex: number) => void;
		onEdit: (programExerciseId: string) => void;
		onRemove: (programExerciseId: string) => void;
	} = $props();

	const FLIP_MS = 200;

	// Drag-and-drop reorder of the exercise list. svelte-dnd-action reorders its
	// own `items` array, so we mirror the session's exercises into local state,
	// let `consider` stream the live shuffle into it, and report the result via
	// `onReorder` on `finalize`. Writable $derived: mirrors `exercises`, but
	// `consider` can write the live drag order into it; it snaps back to the
	// prop whenever `exercises` itself changes.
	let dragItems = $derived<ProgramExerciseDetail[]>(exercises.slice());
	const dragDisabled = $derived(dragItems.length < 2 || pendingExerciseIds.size > 0);

	function handleDndConsider(e: CustomEvent<DndEvent<ProgramExerciseDetail>>) {
		dragItems = e.detail.items;
	}
	function handleDndFinalize(e: CustomEvent<DndEvent<ProgramExerciseDetail>>) {
		dragItems = e.detail.items;
		const id = e.detail.info.id;
		const toIndex = dragItems.findIndex((x) => x.id === id);
		if (id && toIndex >= 0) onReorder(id, toIndex);
	}
</script>

{#if dragItems.length === 0}
	<p class="py-4 text-center text-sm text-base-content/60">No exercises yet.</p>
{:else}
	<div
		class="flex flex-col"
		use:dndzone={{
			items: dragItems,
			flipDurationMs: FLIP_MS,
			dragDisabled,
			dropTargetStyle: {}
		}}
		onconsider={handleDndConsider}
		onfinalize={handleDndFinalize}
	>
		{#each dragItems as exercise (exercise.id)}
			<div
				class="flex min-w-0 items-center gap-3 border-b border-base-300 py-2 last:border-none"
				class:opacity-60={pendingExerciseIds.has(exercise.id)}
				inert={pendingExerciseIds.has(exercise.id)}
				animate:flip={{ duration: FLIP_MS }}
			>
				<CategoryIcon category={exercise.category} />
				<div class="min-w-0 flex-1">
					{#if exercise.category === 'note'}
						<p class="text-sm break-words text-base-content/80">{exercise.note}</p>
					{:else}
						<div class="flex items-baseline gap-2">
							<span class="font-medium">{exercise.activity}</span>
							<span class="text-xs text-base-content/50">{CATEGORY_LABEL[exercise.category]}</span>
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
					{#if dragItems.length > 1}
						<span
							class="cursor-grab text-base-content/40 active:cursor-grabbing"
							aria-hidden="true"
						>
							<DotGridLineIcon class="size-5" />
						</span>
					{/if}
					<button
						type="button"
						class="btn btn-square text-secondary btn-ghost btn-xs"
						aria-label={`Edit ${exercise.activity}`}
						onclick={() => onEdit(exercise.id)}
					>
						<EditBoxLineIcon class="size-4" />
					</button>
					<button
						type="button"
						class="btn btn-square text-error btn-ghost btn-xs"
						aria-label={`Remove ${exercise.activity}`}
						onclick={() => onRemove(exercise.id)}
					>
						<Delete3LineIcon class="size-4" />
					</button>
				</div>
			</div>
		{/each}
	</div>
{/if}
