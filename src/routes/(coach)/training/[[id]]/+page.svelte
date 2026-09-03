<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import { seedExerciseLibrary } from '$lib/data/exerciseLibrary.svelte';
	import { checkPasteWeekConflicts } from '$lib/services/programService.svelte';
	import Button from '$lib/components/Button.svelte';
	import MonthGrid from '$lib/components/MonthGrid.svelte';
	import ProgramBreadcrumb from '$lib/components/ProgramBreadcrumb.svelte';
	import WorkoutTimeline from './WorkoutTimeline.svelte';
	import type { Athlete } from '$lib/types';

	const program = getCoachProgramState();

	function parseKey(key: string) {
		const [y, m, d] = key.split('-').map(Number);
		return new Date(y, m - 1, d);
	}
	function formatWeekLabel(key: string) {
		return parseKey(key).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
	}

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
			const dates = conflicts.map(formatWeekLabel).join(', ');
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
				`This removes ${count} workout${count === 1 ? '' : 's'} from the week of ${formatWeekLabel(program.selectedWeekStart)} for ${name}. This can't be undone.`
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

<h1 class="mt-4 mb-4 font-display text-xl font-bold uppercase">Training</h1>

{#if program.clipboard}
	{@const cb = program.clipboard}
	<div
		class="mt-4 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm"
	>
		<span class="flex-1">
			Copied {cb.type === 'day'
				? formatWeekLabel(cb.dateKey)
				: `the week of ${formatWeekLabel(cb.weekStart)}`}
			from <strong>{cb.athleteName}</strong> — switch athlete or date, then use Paste where you want it
			to land.
		</span>
		<Button
			variant="ghost"
			size="sm"
			aria-label="Clear clipboard"
			onclick={() => program.clearClipboard()}
		>
			Clear
		</Button>
	</div>
{/if}

<div class="my-4 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
	<aside class="card h-fit bg-base-100 shadow-sm lg:sticky lg:top-4 lg:z-10 lg:self-start">
		<div class="card-body">
			<label class="form-control w-full">
				<span class="label">Athlete</span>
				{#if athletes === null}
					<div class="h-10 w-full skeleton"></div>
				{:else}
					<select
						class="select"
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
				highlightWeekOf={program.selectedDate}
			/>

			{#if athlete}
				<div
					class="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-base-300 pt-3"
				>
					<span class="w-full text-xs text-base-content/50"
						>Week of {formatWeekLabel(program.selectedWeekStart)}</span
					>
					<Button variant="secondary" size="sm" onclick={() => program.openAssignModal()}>
						Assign program
					</Button>
					<Button
						variant="secondary"
						size="sm"
						disabled={program.selectedWeekCount === 0}
						onclick={() => handleCopyWeek(athlete.name)}
					>
						Copy week
					</Button>
					<Button
						variant="primary"
						size="sm"
						disabled={!program.clipboard || program.clipboard.type !== 'week'}
						onclick={() => handlePasteWeek(athlete.name)}
					>
						Paste week
					</Button>
					<Button
						variant="destructive"
						size="sm"
						disabled={program.selectedWeekCount === 0}
						onclick={() => handleClearWeek(athlete.name)}
					>
						Clear week
					</Button>
					<Button variant="secondary" size="sm" onclick={() => program.openShiftModal()}>
						Shift schedule
					</Button>
				</div>
			{/if}
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
		<div>
			<ProgramBreadcrumb
				athleteId={athlete.id}
				date={program.selectedDate}
				revision={program.revision}
				showLabel={false}
			/>
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
