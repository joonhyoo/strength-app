<script lang="ts">
	import EditBoxLineIcon from '@iconify-svelte/mingcute/edit-2-line';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import PlusFillIcon from '@iconify-svelte/mingcute/plus-fill';
	import Message3LineIcon from '@iconify-svelte/mingcute/message-3-line';
	import DotGridLineIcon from '@iconify-svelte/mingcute/dot-grid-line';
	import Button from '$lib/components/Button.svelte';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import { getCachedWorkoutDay, getWorkoutDay } from '$lib/services/workoutService.svelte';
	import { getBreadcrumb } from '$lib/services/programTemplateService.svelte';
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import type { Exercise, Breadcrumb } from '$lib/types';
	import { CATEGORY_LABEL } from '$lib/data/categories';
	import { formatPlan } from '$lib/formatPlan';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	const program = getCoachProgramState();
	const FLIP_MS = 200;

	// `date` is the focused day — the one the calendar's selection points at.
	// The whole Monday-Sunday week containing it renders below; picking a new
	// date (in the calendar, or via a day's own actions) scrolls to that day's
	// section rather than replacing what's shown.
	let { athleteId, athleteName, date }: { athleteId: string; athleteName: string; date: Date } =
		$props();

	// Local date-key helpers — deliberately duplicated rather than shared with
	// coachProgramState.svelte.ts's identical copies (same reasoning as there:
	// $lib/server/programSchedule.ts can't be imported client-side, and this is
	// a handful of lines of plain Date arithmetic).
	function toDateKey(d: Date): string {
		return d.toLocaleDateString('fr-CA');
	}
	function parseDateKey(key: string): Date {
		const [y, m, d] = key.split('-').map(Number);
		return new Date(y, m - 1, d);
	}
	function addDaysToKey(key: string, n: number): string {
		const d = parseDateKey(key);
		d.setDate(d.getDate() + n);
		return toDateKey(d);
	}
	function mondayOfKey(key: string): string {
		const d = parseDateKey(key);
		const offset = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
		d.setDate(d.getDate() - offset);
		return toDateKey(d);
	}

	const focusDateKey = $derived(toDateKey(date));
	const weekStart = $derived(mondayOfKey(focusDateKey));

	interface DayEntry {
		dateKey: string;
		date: Date;
		exercises: Exercise[];
		loading: boolean;
		loadError: boolean;
		/** This day's own program/rest-day label (e.g. "Lower Body Strength" or
		 * "Rest day") — null until resolved. Shown as a per-day chip instead of
		 * once at the top, since a whole week of days is visible at once. */
		crumb: Breadcrumb | null;
	}

	// One entry per day of the focused week, Monday first. Each carries its own
	// load state so one slow or failed day never blocks the rest.
	let days = $state<DayEntry[]>([]);

	// Plain (non-reactive) DOM refs for scrolling a day's section into view —
	// same pattern as OtpInput.svelte's `inputs` array.
	let dayEls: Record<string, HTMLElement> = {};

	function handleDndFinalize(day: DayEntry, e: CustomEvent<DndEvent<Exercise>>) {
		day.exercises = e.detail.items;
		const id = e.detail.info.id;
		const toIndex = day.exercises.findIndex((x) => x.id === id);
		if (id && toIndex >= 0) program.reorderExercise(id, toIndex);
	}

	let loadToken = 0;

	$effect(() => {
		void program.revision;
		const id = athleteId;
		const start = weekStart;
		// Switching athlete/week (or a revision bump) fires overlapping loads;
		// only the newest may write state.
		const token = ++loadToken;

		const keys = Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i));

		// Paint whatever's already cached for each day immediately — never leave
		// the previous week's days on screen under the new week — then
		// reconcile every day independently.
		days = keys.map((dateKey) => {
			const cached = getCachedWorkoutDay(id, dateKey);
			return {
				dateKey,
				date: parseDateKey(dateKey),
				exercises: cached ?? [],
				loading: cached === null,
				loadError: false,
				crumb: null
			};
		});

		for (const dateKey of keys) {
			getWorkoutDay(id, dateKey)
				.then((list) => {
					if (token !== loadToken) return;
					const day = days.find((d) => d.dateKey === dateKey);
					if (!day) return;
					day.exercises = list;
					day.loading = false;
					program.setDayStatus(dateKey, list);
				})
				.catch(() => {
					if (token !== loadToken) return;
					const day = days.find((d) => d.dateKey === dateKey);
					if (!day) return;
					day.loading = false;
					if (getCachedWorkoutDay(id, dateKey) === null) day.loadError = true;
				});

			getBreadcrumb(id, dateKey).then((result) => {
				if (token !== loadToken) return;
				const day = days.find((d) => d.dateKey === dateKey);
				if (day) day.crumb = result;
			});
		}
	});

	// Bring the focused day's section into view whenever it changes — a
	// calendar click (or a day's own Copy/Paste/Add action re-focusing it)
	// scrolls here instead of swapping which day is shown. Days render (with
	// their own loading state) as soon as `days` is rebuilt above, so this
	// doesn't need to wait on the network fetch — only on the section existing.
	$effect(() => {
		const key = focusDateKey;
		dayEls[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	});

	async function handleRemove(id: string) {
		await program.removeExercise(id);
	}

	function handleCopyDay(day: DayEntry) {
		program.selectDate(day.date);
		program.copyDay(athleteName);
	}

	async function handlePasteDay(day: DayEntry) {
		const existingStatus = program.statusMap.get(day.dateKey);
		if (existingStatus && existingStatus !== 'none') {
			if (
				!confirm(
					`${day.date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })} already has a workout for ${athleteName}. Pasting will replace it. Continue?`
				)
			)
				return;
		}
		program.selectDate(day.date);
		await program.pasteDay();
	}

	function openAddExercise(day: DayEntry) {
		program.selectDate(day.date);
		program.openModal();
	}

	function openAddNote(day: DayEntry) {
		program.selectDate(day.date);
		program.openModal('note');
	}
</script>

<div class="flex w-full min-w-0 flex-col gap-4">
	{#each days as day, i (day.dateKey)}
		{#if i > 0}
			<div class="mx-auto w-[70%] border-t border-dashed border-muted-fg"></div>
		{/if}
		<div
			bind:this={dayEls[day.dateKey]}
			class="card w-full min-w-0 border-2 bg-base-100 shadow-sm {day.dateKey === focusDateKey
				? 'border-primary'
				: 'border-transparent'}"
		>
			<div class="card-body">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="card-title text-base">
							{day.date.toLocaleDateString('en-AU', {
								weekday: 'long',
								day: 'numeric',
								month: 'long'
							})}
						</h2>
						{#if day.crumb}
							<span class="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
								{day.crumb.label}
							</span>
						{/if}
					</div>
					<div class="flex shrink-0 gap-2">
						<Button
							variant="secondary"
							size="sm"
							disabled={day.exercises.length === 0}
							onclick={() => handleCopyDay(day)}
						>
							Copy day
						</Button>
						<Button
							variant="primary"
							size="sm"
							disabled={!program.clipboard || program.clipboard.type !== 'day'}
							onclick={() => handlePasteDay(day)}
						>
							Paste day
						</Button>
					</div>
				</div>

				{#if day.loading}
					<p class="py-6 text-center text-base-content/60">Loading…</p>
				{:else if day.loadError}
					<p class="py-6 text-center text-base-content/60">Couldn't load this day.</p>
				{:else if day.exercises.length === 0}
					<p class="py-6 text-center text-base-content/60">No exercises scheduled for this day.</p>
				{:else}
					<div
						class="flex flex-col"
						use:dndzone={{
							items: day.exercises,
							flipDurationMs: FLIP_MS,
							dragDisabled: day.exercises.length < 2,
							dropTargetStyle: {}
						}}
						onconsider={(e) => (day.exercises = e.detail.items)}
						onfinalize={(e) => handleDndFinalize(day, e)}
					>
						{#each day.exercises as exercise, i (exercise.id)}
							<div class="flex min-w-0 items-center gap-4" animate:flip={{ duration: FLIP_MS }}>
								<div class="flex flex-col items-center self-stretch">
									<span class="w-px flex-1 bg-base-300 {i === 0 ? 'invisible' : ''}"></span>
									<CategoryIcon category={exercise.category} />
									<span
										class="w-px flex-1 bg-base-300 {i === day.exercises.length - 1
											? 'invisible'
											: ''}"
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
										{#if day.exercises.length > 1}
											<span
												class="cursor-grab text-base-content/40 active:cursor-grabbing"
												aria-hidden="true"
											>
												<DotGridLineIcon class="size-5" />
											</span>
										{/if}
										<button
											class="btn text-secondary btn-ghost btn-sm"
											aria-label={`Edit ${exercise.activity}`}
											onclick={() => exercise.id && program.openEdit(exercise)}
										>
											<EditBoxLineIcon class="size-5" />
										</button>
										<button
											class="btn text-error btn-ghost btn-sm"
											aria-label={`Remove ${exercise.activity}`}
											onclick={() => exercise.id && handleRemove(exercise.id)}
										>
											<Delete3LineIcon class="size-5" />
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<div class="mt-2 flex gap-2">
					<Button variant="dashed" class="flex-1" onclick={() => openAddExercise(day)}>
						<PlusFillIcon class="size-4" />
						Add exercise
					</Button>
					<Button variant="dashed-muted" onclick={() => openAddNote(day)}>
						<Message3LineIcon class="size-5" />
						Add note
					</Button>
				</div>
			</div>
		</div>
	{/each}
</div>
