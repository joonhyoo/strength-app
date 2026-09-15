<script lang="ts">
	import LeftFillIcon from '@iconify-svelte/mingcute/left-fill';
	import RightFillIcon from '@iconify-svelte/mingcute/right-fill';
	import AddFillIcon from '@iconify-svelte/mingcute/add-fill';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import { getCoachProgramState, type DayEntry } from '$lib/coachProgramState.svelte';
	import { parseKey, toKey, monthGridKeys } from '$lib/dateKey';
	import { formatPlan } from '$lib/formatPlan';
	import type { Athlete, Exercise } from '$lib/types';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	const FLIP_MS = 200;
	const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	let {
		athletes,
		athlete,
		onAthleteChange
	}: {
		athletes: Athlete[] | null;
		athlete: Athlete | null;
		onAthleteChange: (id: string) => void;
	} = $props();

	const program = getCoachProgramState();

	// Local to this view — nothing outside MonthTimeline needs to know which
	// month is scrolled into view, unlike selectedDate/selectedWeekStart which
	// the sidebar calendar, WorkoutTimeline and the Assign/Shift modals share.
	let monthOffset = $state(0);
	const viewDate = $derived(
		new Date(program.selectedDate.getFullYear(), program.selectedDate.getMonth() + monthOffset, 1)
	);
	const monthLabel = $derived(
		viewDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
	);
	const gridKeys = $derived(monthGridKeys(viewDate));
	const todayKey = toKey(new Date());

	function changeMonth(delta: number) {
		monthOffset += delta;
	}

	// Re-runs every time MonthTimeline mounts (i.e. every time the coach
	// switches into month view) — that's what keeps this repainted instead of
	// showing whatever it last held.
	$effect(() => {
		if (athlete) program.loadMonth(athlete.id, gridKeys);
	});

	const monthDayMap = $derived(new Map(program.monthDays.map((d) => [d.dateKey, d])));

	function openAdd(date: Date) {
		program.selectDate(date);
		program.openModal();
	}

	function handleDndFinalize(day: DayEntry, e: CustomEvent<DndEvent<Exercise>>) {
		day.exercises = e.detail.items;
		const id = e.detail.info.id;
		const toIndex = day.exercises.findIndex((x) => x.id === id);
		if (id && toIndex >= 0) program.reorderExercise(day.dateKey, id, toIndex);
	}
</script>

<div class="flex w-full min-w-0 flex-col gap-3 lg:min-h-0 lg:flex-1">
	<div class="card w-full shrink-0 border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body flex-row flex-wrap items-center justify-between gap-3 px-4 py-3">
			{#if athletes === null}
				<div class="h-9 w-48 skeleton"></div>
			{:else}
				<select
					class="select w-48 select-sm"
					value={athlete?.id ?? ''}
					onchange={(e) => onAthleteChange(e.currentTarget.value)}
				>
					<option value="">Select athlete…</option>
					{#each athletes as option (option.id)}
						<option value={option.id}>{option.name}</option>
					{/each}
				</select>
			{/if}

			<div class="flex items-center gap-1">
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => changeMonth(-1)}>
					<LeftFillIcon class="size-5" />
				</button>
				<h2 class="w-40 text-center font-display text-base uppercase">{monthLabel}</h2>
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => changeMonth(1)}>
					<RightFillIcon class="size-5" />
				</button>
			</div>
		</div>
	</div>

	{#if !athlete}
		<div class="card bg-base-100 shadow-sm">
			<div class="card-body items-center py-16 text-center">
				<p class="text-base-content/60">Select an athlete to view and schedule their workouts.</p>
			</div>
		</div>
	{:else}
		<div
			class="card overflow-x-auto border border-base-300 bg-base-100 shadow-sm lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-y-contain"
		>
			<div class="card-body min-w-[700px] p-3">
				<div
					class="sticky top-0 z-10 grid grid-cols-7 gap-px bg-base-100 pb-1 text-center text-xs font-semibold text-base-content/60"
				>
					{#each DOW as label (label)}
						<span class="py-1">{label}</span>
					{/each}
				</div>

				<div class="grid grid-cols-7 gap-px bg-base-300">
					{#each gridKeys as key (key)}
						{@const day = monthDayMap.get(key)}
						{@const cellDate = parseKey(key)}
						{@const inMonth = cellDate.getMonth() === viewDate.getMonth()}
						{@const isToday = key === todayKey}
						<div
							class="flex min-h-28 flex-col gap-1 p-1.5 {inMonth
								? 'bg-base-100'
								: 'bg-base-200/40'}"
						>
							<span
								class="text-xs {inMonth ? 'text-base-content/70' : 'text-base-content/40'} {isToday
									? 'font-bold text-primary'
									: ''}"
							>
								{cellDate.getDate()}
							</span>

							{#if day?.loading}
								<div class="h-3 w-3/4 skeleton"></div>
							{:else if day}
								<div
									class="flex flex-col select-none"
									use:dndzone={{
										items: day.exercises,
										flipDurationMs: FLIP_MS,
										dragDisabled: day.exercises.length < 2,
										dropTargetStyle: {}
									}}
									onconsider={(e) => (day.exercises = e.detail.items)}
									onfinalize={(e) => handleDndFinalize(day, e)}
								>
									{#each day.exercises as exercise (exercise.id)}
										{@const pending = !!exercise.id && program.pendingExerciseIds.has(exercise.id)}
										<div
											class="flex min-w-0 cursor-grab items-center gap-1 rounded p-0.5 active:cursor-grabbing"
											class:opacity-60={pending}
											inert={pending}
											animate:flip={{ duration: FLIP_MS }}
										>
											<CategoryIcon category={exercise.category} size="sm" />
											<button
												type="button"
												class="min-w-0 flex-1 cursor-pointer text-left"
												onclick={() => exercise.id && program.openEdit(exercise)}
											>
												{#if exercise.category === 'note'}
													<span
														class="line-clamp-2 block text-xs leading-tight text-base-content/70 italic"
														>{exercise.note}</span
													>
												{:else}
													<span class="block truncate text-sm leading-tight font-medium">
														{exercise.activity}
														{#if formatPlan(exercise.plan)}
															<span class="text-base-content/50">
																· {formatPlan(exercise.plan)}</span
															>
														{/if}
													</span>
													{#if exercise.note}
														<span
															class="line-clamp-2 block text-xs leading-tight text-base-content/50"
															>{exercise.note}</span
														>
													{/if}
												{/if}
											</button>
										</div>
									{/each}
								</div>
							{/if}

							<button
								type="button"
								class="flex min-w-0 cursor-pointer items-center gap-1 rounded p-0.5 text-left text-base-content/50 hover:text-primary"
								onclick={() => openAdd(cellDate)}
							>
								<span class="shrink-0 rounded-full p-2">
									<AddFillIcon class="size-5" />
								</span>
								<span
									class="min-w-0 flex-1 truncate text-xs leading-none font-semibold tracking-wider uppercase"
								>
									Add exercise
								</span>
							</button>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
