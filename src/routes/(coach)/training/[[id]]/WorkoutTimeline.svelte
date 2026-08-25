<script lang="ts">
	import EditBoxLineIcon from '@iconify-svelte/mingcute/edit-2-line';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import PlusLineIcon from '@iconify-svelte/mingcute/plus-line';
	import ArrowUpLineIcon from '@iconify-svelte/mingcute/arrow-up-line';
	import ArrowDownLineIcon from '@iconify-svelte/mingcute/arrow-down-line';
	import { SvelteMap } from 'svelte/reactivity';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import { getWorkoutDay } from '$lib/services/workoutService.svelte';
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import type { Exercise, ExerciseCategory } from '$lib/types';

	const program = getCoachProgramState();

	let { athleteId, date }: { athleteId: string; date: Date } = $props();

	const dateKey = $derived(date.toLocaleDateString('fr-CA'));

	let exercises = $state<Exercise[]>([]);
	let loading = $state(true);

	$effect(() => {
		loading = true;
		void program.revision;
		getWorkoutDay(athleteId, dateKey).then((list) => {
			exercises = list;
			loading = false;
		});
	});

	const categoryLabel: Record<ExerciseCategory, string> = {
		warmup: 'Warmup',
		circuit: 'Circuit',
		plyo: 'Plyo',
		weight: 'Weight'
	};

	const formatPlan = (plan: number[]) => {
		if (plan.length === 0) return '';

		const counts = new SvelteMap<number, number>();
		for (const reps of plan) {
			counts.set(reps, (counts.get(reps) ?? 0) + 1);
		}

		return [...counts.entries()]
			.map(([num, count]) => (count > 1 ? `${count} x ${num}` : `${num}`))
			.join(', ');
	};

	async function handleRemove(id: string) {
		await program.removeExercise(id);
	}
</script>

<div class="card w-full min-w-0 bg-base-100 shadow-sm">
	<div class="card-body">
		<div class="flex items-center justify-between">
			<h2 class="card-title text-base">
				{date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
			</h2>
		</div>

		{#if loading}
			<p class="py-6 text-center text-base-content/60">Loading…</p>
		{:else if exercises.length === 0}
			<p class="py-6 text-center text-base-content/60">No exercises scheduled for this day.</p>
		{:else}
			<div class="flex flex-col">
				{#each exercises as exercise, i (exercise.id)}
					<div class="flex min-w-0 items-center gap-4">
						<div class="flex flex-col items-center self-stretch">
							<span class="w-px flex-1 bg-base-300 {i === 0 ? 'invisible' : ''}"></span>
							<CategoryIcon category={exercise.category} />
							<span class="w-px flex-1 bg-base-300 {i === exercises.length - 1 ? 'invisible' : ''}"
							></span>
						</div>

						<div class="flex min-w-0 flex-1 items-center gap-3 py-1">
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline gap-2">
									<span class="font-medium">{exercise.activity}</span>
									<span class="text-xs text-base-content/50"
										>{categoryLabel[exercise.category]}</span
									>
								</div>
								{#if formatPlan(exercise.plan) || exercise.note}
									<p class="truncate text-sm text-base-content/60">
										{formatPlan(exercise.plan)}{exercise.plan.length && exercise.note.length
											? ' · '
											: ''}{exercise.note}
									</p>
								{/if}
							</div>
							<div class="flex shrink-0 flex-col items-center gap-0.5">
								<button
									class="btn btn-ghost btn-xs"
									aria-label={`Move ${exercise.activity} up`}
									disabled={i === 0}
									onclick={() => exercise.id && program.moveExercise(exercise.id, 'up')}
								>
									<ArrowUpLineIcon height="1.2em" />
								</button>
								<button
									class="btn btn-ghost btn-xs"
									aria-label={`Move ${exercise.activity} down`}
									disabled={i === exercises.length - 1}
									onclick={() => exercise.id && program.moveExercise(exercise.id, 'down')}
								>
									<ArrowDownLineIcon height="1.2em" />
								</button>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								<button
									class="btn text-secondary btn-ghost btn-xs"
									aria-label={`Edit ${exercise.activity}`}
									onclick={() => exercise.id && program.openEdit(exercise.id)}
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

		<button
			class="btn-dashed btn mt-2 border-dashed border-base-300 text-primary"
			onclick={() => program.openModal()}
		>
			<PlusLineIcon height="1.2em" />
			Add exercise
		</button>
	</div>
</div>
