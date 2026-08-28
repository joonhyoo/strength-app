<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import { seedExerciseLibrary } from '$lib/data/exerciseLibrary.svelte';
	import MonthGrid from '$lib/components/MonthGrid.svelte';
	import WorkoutTimeline from './WorkoutTimeline.svelte';
	import type { Athlete } from '$lib/types';

	const program = getCoachProgramState();

	// Streamed from the (coach) layout's load — null until the promise
	// resolves, so the rest of the page can render immediately.
	let athletes = $state<Athlete[] | null>(null);

	$effect(() => {
		(page.data.athletes as Promise<Athlete[]>).then((list) => (athletes = list));
	});

	const athlete = $derived(athletes?.find((a) => a.id === page.params.id) ?? null);

	$effect(() => {
		if (athlete) {
			program.selectAthlete(athlete.id);
			program.loadStatusMap();
		} else {
			program.selectAthlete(null);
			program.statusMap.clear();
		}
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		const handler = () => {
			if (athlete) program.loadStatusMap();
		};
		document.addEventListener('visibilitychange', handler);
		return () => document.removeEventListener('visibilitychange', handler);
	});

	$effect(() => {
		(page.data.exerciseLibrary as Promise<Parameters<typeof seedExerciseLibrary>[0]>).then(
			seedExerciseLibrary
		);
	});

	function onAthleteChange(id: string) {
		// Replaces rather than pushes; see the note in src/app.html.
		goto(resolve(id ? `/training/${id}` : '/training'), { replaceState: true });
	}
</script>

<svelte:head>
	<title>Strength App — Training</title>
</svelte:head>

<div class="my-4 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
	<aside class="card h-fit bg-base-100 shadow-sm">
		<div class="card-body">
			<label class="form-control w-full">
				<span class="label">Athlete</span>
				{#if athletes === null}
					<div class="h-10 w-full skeleton"></div>
				{:else}
					<select
						class="select-bordered select"
						value={athlete?.id ?? ''}
						onchange={(e) => onAthleteChange(e.currentTarget.value)}
					>
						<option value="">Select athlete…</option>
						{#each athletes as option (option.id)}
							<option value={option.id}>{option.name}</option>
						{/each}
					</select>
				{/if}
			</label>

			<h2 class="mt-2 font-semibold text-base-content/70">Calendar</h2>

			<MonthGrid
				selectedDate={program.selectedDate}
				dayStatus={(dateKey) => program.statusMap.get(dateKey) ?? 'none'}
				onselect={(date) => program.selectDate(date)}
			/>
		</div>
	</aside>

	{#if athletes === null}
		<div class="card bg-base-100 shadow-sm">
			<div class="card-body gap-3">
				<div class="h-6 w-40 skeleton"></div>
				<div class="h-32 w-full skeleton"></div>
			</div>
		</div>
	{:else if athlete}
		<WorkoutTimeline athleteId={athlete.id} date={program.selectedDate} />
	{:else}
		<div class="card bg-base-100 shadow-sm">
			<div class="card-body items-center py-16 text-center">
				<p class="text-base-content/60">Select an athlete to view and schedule their workouts.</p>
			</div>
		</div>
	{/if}
</div>

{#if athlete && program.modalOpen}
	{#await import('./AddExerciseModal.svelte') then { default: AddExerciseModal }}
		<AddExerciseModal />
	{:catch}
		<p
			class="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit rounded-lg bg-error px-4 py-2 text-sm text-error-content shadow-lg"
		>
			Couldn't load — please reload the page.
		</p>
	{/await}
{/if}
