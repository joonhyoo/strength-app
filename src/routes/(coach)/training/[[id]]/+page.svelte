<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getCoachProgramState, type Clipboard } from '$lib/coachProgramState.svelte';
	import { seedExerciseLibrary } from '$lib/data/exerciseLibrary.svelte';
	import { checkPasteWeekConflicts } from '$lib/services/programService.svelte';
	import { formatDayMonth } from '$lib/dateKey';
	import CopyPasteButton from '$lib/components/CopyPasteButton.svelte';
	import MonthGrid from '$lib/components/MonthGrid.svelte';
	import ProgramBreadcrumb from '$lib/components/ProgramBreadcrumb.svelte';
	import WorkoutTimeline from './WorkoutTimeline.svelte';
	import type { Athlete } from '$lib/types';

	const program = getCoachProgramState();

	// The "copied" toast stays mounted and fades via a CSS class toggle (this
	// app doesn't use Svelte's transition: directives), so it can animate out
	// after `program.clipboard` clears on Cancel or a paste. `lastClipboard`
	// holds its text steady through that fade.
	let lastClipboard = $state<Clipboard | null>(null);
	$effect(() => {
		if (program.clipboard) lastClipboard = program.clipboard;
	});

	async function handleCopyWeek(name: string) {
		program.copyWeek(name);
	}

	async function handlePasteWeek(name: string) {
		if (
			!program.clipboard ||
			program.clipboard.type !== 'week' ||
			program.selectedAthleteId === null
		)
			return;

		const { conflicts } = await checkPasteWeekConflicts(
			program.clipboard.athleteId,
			program.clipboard.weekStart,
			program.selectedAthleteId,
			program.selectedWeekStart
		);

		if (conflicts.length > 0) {
			const dates = conflicts.map(formatDayMonth).join(', ');
			if (
				!confirm(
					`Pasting this week onto ${name} will replace their existing workout on: ${dates}. Continue?`
				)
			)
				return;
		}

		await program.pasteWeek();
	}

	async function handleClearWeek(name: string) {
		const count = program.selectedWeekCount;
		if (count === 0) return;
		if (
			!confirm(
				`This removes ${count} workout${count === 1 ? '' : 's'} from the week of ${formatDayMonth(program.selectedWeekStart)} for ${name}. This can't be undone.`
			)
		)
			return;
		await program.clearWeek();
	}

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
			program.weekDays = [];
			program.statusMap.clear();
		}
	});

	// The visible week's workout days — reloads whenever the athlete or the
	// selected week changes ($derived so an in-week date tap doesn't refetch).
	const weekStart = $derived(program.selectedWeekStart);
	$effect(() => {
		if (athlete) program.loadWeek(athlete.id, weekStart);
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		const handler = () => {
			if (athlete) {
				program.loadWeek(athlete.id, program.selectedWeekStart);
				program.loadStatusMap();
			}
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

<div
	class="fixed top-4 right-4 z-50 max-w-sm transition-opacity duration-200 {program.clipboard
		? 'pointer-events-auto opacity-100'
		: 'pointer-events-none opacity-0'}"
	inert={!program.clipboard}
>
	{#if lastClipboard}
		{@const cb = lastClipboard}
		<div
			class="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm shadow-lg"
		>
			<span class="flex-1">
				Copied {cb.type === 'day'
					? formatDayMonth(cb.dateKey)
					: `the week of ${formatDayMonth(cb.weekStart)}`}
				from <strong>{cb.athleteName}</strong>
			</span>
			<button
				type="button"
				class="btn btn-outline btn-sm btn-primary"
				aria-label="Cancel copy"
				onclick={() => program.clearClipboard()}
			>
				Cancel
			</button>
		</div>
	{/if}
</div>

<div class="my-4 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
	<aside class="card h-fit bg-base-100 shadow-sm lg:sticky lg:top-4 lg:z-10 lg:self-start">
		<div class="card-body">
			<h1 class="mb-3 font-display text-xl font-bold uppercase">Training</h1>

			<label class="flex w-full flex-col gap-1.5">
				<span class="label">Athlete</span>
				{#if athletes === null}
					<div class="h-10 w-full skeleton"></div>
				{:else}
					<select
						class="select w-full"
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

			<h2 class="mt-3 font-semibold text-base-content/70">Calendar</h2>

			<div class="mt-3">
				<MonthGrid
					selectedDate={program.selectedDate}
					dayStatus={(dateKey) => program.statusMap.get(dateKey) ?? 'none'}
					onselect={(date) => program.selectDate(date)}
					highlightWeekOf={program.selectedDate}
				/>
			</div>

			{#if athlete}
				<div class="mt-3 border-t border-dashed border-base-300 pt-3">
					{#if program.selectedWeekCrumb}
						<ProgramBreadcrumb crumb={program.selectedWeekCrumb} showLabel={false} />
					{:else}
						<p class="text-sm text-base-content/50 italic">No program assigned this week</p>
					{/if}

					<div class="mt-3 flex flex-col gap-2 border-t border-dashed border-base-300 pt-3">
						<button
							type="button"
							class="btn w-full btn-sm btn-neutral"
							onclick={() => program.openAssignModal()}
						>
							Assign program
						</button>
						<CopyPasteButton
							mode={program.weekClipboardMode}
							noun="week"
							canCopy={program.selectedWeekCount > 0}
							class="w-full"
							oncopy={() => handleCopyWeek(athlete.name)}
							onpaste={() => handlePasteWeek(athlete.name)}
							oncancel={() => program.clearClipboard()}
						/>
						<button
							type="button"
							class="btn w-full btn-sm btn-neutral"
							onclick={() => program.openShiftModal()}
						>
							Shift schedule
						</button>
						<button
							type="button"
							class="btn w-full btn-outline btn-sm btn-error"
							disabled={program.selectedWeekCount === 0}
							onclick={() => handleClearWeek(athlete.name)}
						>
							Clear week
						</button>
					</div>
				</div>
			{/if}
		</div>
	</aside>

	<hr class="border-t border-base-300 lg:hidden" />

	{#if athletes === null}
		<div class="card bg-base-100 shadow-sm">
			<div class="card-body gap-3">
				<div class="h-6 w-40 skeleton"></div>
				<div class="h-32 w-full skeleton"></div>
			</div>
		</div>
	{:else if athlete}
		<div>
			<WorkoutTimeline
				athleteId={athlete.id}
				athleteName={athlete.name}
				date={program.selectedDate}
			/>
		</div>
	{:else}
		<div class="card bg-base-100 shadow-sm">
			<div class="card-body items-center py-16 text-center">
				<p class="text-base-content/60">Select an athlete to view and schedule their workouts.</p>
			</div>
		</div>
	{/if}
</div>

{#if athlete && program.assignModalOpen}
	{#await import('./AssignModal.svelte') then { default: AssignModal }}
		<AssignModal athleteId={athlete.id} athleteName={athlete.name} />
	{/await}
{/if}

{#if athlete && program.shiftModalOpen}
	{#await import('./ShiftModal.svelte') then { default: ShiftModal }}
		<ShiftModal athleteId={athlete.id} athleteName={athlete.name} />
	{/await}
{/if}

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
