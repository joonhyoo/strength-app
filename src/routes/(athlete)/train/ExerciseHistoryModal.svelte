<script lang="ts">
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import LeftLineIcon from '@iconify-svelte/mingcute/left-line';
	import {
		getExerciseHistory,
		type ExerciseHistorySession
	} from '$lib/services/workoutService.svelte';

	let {
		athleteId,
		exerciseId,
		activity,
		before,
		onclose
	}: {
		athleteId: string;
		exerciseId: string;
		activity: string;
		/** Day of the open workout — history is everything strictly before it. */
		before: string;
		onclose: () => void;
	} = $props();

	let sessions = $state<ExerciseHistorySession[] | null>(null);
	let failed = $state(false);

	onMount(async () => {
		try {
			sessions = await getExerciseHistory(athleteId, exerciseId, before);
		} catch {
			failed = true;
		}
	});

	/** Slide the panel over / off the workout modal from the right. Svelte runs
	 *  this on mount (intro) and reversed when the parent drops the `{#if}`
	 *  (outro), so both directions come for free — no nested <dialog> / top-layer
	 *  juggling, which is what kept breaking the slide-out. */
	function pushSlide(_node: Element, { duration = 280 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (t: number) => `transform: translateX(${(1 - t) * 100}%)`
		};
	}

	function formatDate(key: string) {
		const [y, m, d] = key.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<div class="absolute inset-0 z-10 flex flex-col bg-base-100" transition:pushSlide>
	<header class="shrink-0 border-b border-base-300 pt-[env(safe-area-inset-top)] sm:pt-8">
		<div class="relative flex min-h-14 items-center px-2">
			<button type="button" class="btn gap-1 btn-ghost" onclick={onclose}>
				<LeftLineIcon height="1.4em" />
				Back
			</button>
			<div
				class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-24"
			>
				<h2 class="max-w-full truncate text-base font-bold">{activity}</h2>
				<p class="text-xs text-base-content/60">Previous sessions</p>
			</div>
		</div>
	</header>

	<div
		class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[env(safe-area-inset-bottom)] sm:pb-8"
	>
		{#if failed}
			<p class="py-10 text-center text-base-content/60">Couldn't load history.</p>
		{:else if sessions === null}
			<div class="flex flex-col gap-3">
				<div class="h-28 w-full skeleton"></div>
				<div class="h-28 w-full skeleton"></div>
				<div class="h-28 w-full skeleton"></div>
			</div>
		{:else if sessions.length === 0}
			<p class="py-10 text-center text-base-content/60">No logged sessions yet.</p>
		{:else}
			<div class="flex flex-col gap-3">
				{#each sessions as session (session.id)}
					<div class="rounded-lg border border-base-300 p-2.5">
						<div class="mb-1.5 flex items-center justify-between">
							<span class="text-sm font-semibold">{formatDate(session.dateKey)}</span>
							{#if session.complete}
								<span class="text-xs font-medium text-success">Complete</span>
							{/if}
						</div>
						<div class="overflow-x-auto">
							<table class="table table-xs">
								<tbody>
									<tr>
										<th class="font-medium text-base-content/50">Set</th>
										{#each session.sets as set (set.setNumber)}
											<td class="text-center font-medium">{set.setNumber}</td>
										{/each}
									</tr>
									<tr>
										<th class="font-medium text-base-content/50">Weight</th>
										{#each session.sets as set (set.setNumber)}
											<td class="text-center">{set.weight ?? '—'}</td>
										{/each}
									</tr>
									<tr>
										<th class="font-medium text-base-content/50">Reps</th>
										{#each session.sets as set (set.setNumber)}
											<td class="text-center">{set.reps ?? set.targetReps}</td>
										{/each}
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
