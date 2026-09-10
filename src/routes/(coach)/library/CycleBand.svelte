<script lang="ts">
	import EditBoxLineIcon from '@iconify-svelte/mingcute/edit-2-line';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import AddFillIcon from '@iconify-svelte/mingcute/add-fill';
	import CopyLineIcon from '@iconify-svelte/mingcute/copy-line';
	import Message3LineIcon from '@iconify-svelte/mingcute/message-3-line';
	import { getProgramBuilderState } from '$lib/programBuilderState.svelte';
	import { cycleColorCss } from '$lib/data/cycleColors';
	import ExerciseDragList from './ExerciseDragList.svelte';
	import WeekDayGrid from './WeekDayGrid.svelte';
	import type { ProgramDetail } from '$lib/types';

	let { cycle }: { cycle: ProgramDetail['cycles'][number] } = $props();

	const builder = getProgramBuilderState();

	const expandedWeek = $derived(cycle.weeks.find((w) => w.id === builder.expandedWeekId) ?? null);
	const expandedWeekIndex = $derived(
		expandedWeek ? cycle.weeks.findIndex((w) => w.id === expandedWeek.id) : -1
	);
	const expandedSession = $derived(
		expandedWeek?.sessions.find((s) => s.id === builder.expandedSessionId) ?? null
	);

	// Non-null only while a session is on the clipboard. The day grid of
	// whichever week is open then turns into a set of paste targets.
	const clipboard = $derived(builder.sessionClipboard);

	// True while the expanded week is an optimistic copy still reconciling with
	// the server — the grid is frozen (inert) so an edit can't hit a temp id.
	const weekPending = $derived(!!expandedWeek && builder.pendingWeekIds.has(expandedWeek.id));

	let copyBusy = $state(false);
	let copyError = $state('');
	let pasteBusy = $state(false);
	let pasteError = $state('');

	async function handleCopyPreviousWeek() {
		copyBusy = true;
		copyError = '';
		const res = await builder.copyPreviousWeek(cycle.id);
		copyBusy = false;
		if (res && !res.ok) copyError = res.error ?? 'Could not copy the week.';
	}

	async function handlePasteInto(
		dayNumber: number,
		dowLabel: string,
		existing: { name: string } | undefined
	) {
		if (!expandedWeek || !clipboard) return;
		if (
			existing &&
			!confirm(
				`Replace "${existing.name}" on ${dowLabel} with "${clipboard.sessionName}"? The current session's exercises will be removed.`
			)
		)
			return;
		pasteBusy = true;
		pasteError = '';
		const res = await builder.pasteSession(expandedWeek.id, dayNumber, Boolean(existing));
		pasteBusy = false;
		if (res && !res.ok) pasteError = res.error ?? 'Could not paste the session.';
	}

	async function handleDeleteCycle() {
		if (
			!confirm(
				`Delete "${cycle.name}"? This deletes the cycle and all its weeks and sessions. Athletes already assigned from it keep their scheduled days — they just lose the program/week label.`
			)
		)
			return;
		await builder.removeCycle(cycle.id);
	}

	async function handleDeleteWeek(weekId: string) {
		if (!confirm('Delete this week? This removes every session and exercise in it.')) return;
		await builder.removeWeek(weekId);
	}

	async function handleDeleteSession(sessionId: string) {
		if (!confirm('Remove this session? The day reverts to a rest day.')) return;
		await builder.removeSession(sessionId);
	}

	async function handleDeleteExercise(programExerciseId: string) {
		if (!confirm('Remove this exercise?')) return;
		await builder.removeExercise(programExerciseId);
	}
</script>

<section class="card w-full border-2 border-border bg-base-100">
	<div class="card-body">
		<div class="flex flex-wrap items-center gap-2">
			<span
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				style="background:{cycleColorCss(cycle.colorKey)}"
			></span>
			<span class="font-bold">{cycle.name}</span>
			<span class="text-xs text-base-content/50"
				>{cycle.weeks.length} week{cycle.weeks.length === 1 ? '' : 's'}</span
			>
			<span class="ml-auto flex gap-1">
				<button
					type="button"
					class="btn btn-square btn-ghost btn-xs"
					aria-label={`Edit ${cycle.name}`}
					onclick={() =>
						builder.openModal({ type: 'cycle', programId: cycle.id, cycleId: cycle.id })}
				>
					<EditBoxLineIcon class="size-4" />
				</button>
				<button
					type="button"
					class="btn btn-square text-error btn-ghost btn-xs"
					aria-label={`Delete ${cycle.name}`}
					onclick={handleDeleteCycle}
				>
					<Delete3LineIcon class="size-4" />
				</button>
			</span>
			{#if cycle.goal}
				<p class="w-full text-sm text-base-content/60">{cycle.goal}</p>
			{/if}
		</div>

		<div class="mt-3 flex flex-wrap gap-2">
			{#each cycle.weeks as week, i (week.id)}
				<button
					type="button"
					class="min-w-10 rounded-lg border px-2.5 py-1.5 text-center font-mono text-base font-bold {builder.expandedWeekId ===
					week.id
						? 'border-primary text-primary'
						: 'border-base-300 bg-base-200 text-base-content hover:border-primary'}"
					class:animate-pulse={builder.pendingWeekIds.has(week.id)}
					aria-label={`Week ${i + 1}`}
					onclick={() => builder.toggleWeek(week.id)}
				>
					{i + 1}
				</button>
			{/each}
			{#if cycle.weeks.length > 0}
				<button
					type="button"
					class="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-base-300 px-2.5 py-1.5 text-sm tracking-wider text-primary uppercase hover:bg-primary/10 disabled:opacity-50"
					aria-label={`Copy the last week of ${cycle.name} into a new week`}
					disabled={copyBusy}
					onclick={handleCopyPreviousWeek}
				>
					{#if copyBusy}
						<span class="loading loading-xs loading-spinner"></span>
					{/if}
					Copy previous week
				</button>
			{/if}
			<button
				type="button"
				class="flex min-w-10 items-center justify-center rounded-lg border border-dashed border-base-300 px-2.5 py-1.5 text-primary hover:bg-primary/10"
				aria-label={`Add a blank week to ${cycle.name}`}
				onclick={() => builder.addWeek(cycle.id)}
			>
				<AddFillIcon class="size-4" />
			</button>
		</div>
		{#if copyError}
			<p class="mt-1 text-xs text-error">{copyError}</p>
		{/if}

		{#if expandedWeek}
			<div
				class="mt-3 border-t border-dashed border-base-300 pt-3"
				class:opacity-60={weekPending}
				inert={weekPending}
			>
				{#if weekPending}
					<p class="mb-2 flex items-center gap-2 text-xs text-base-content/60">
						<span class="loading loading-xs loading-spinner"></span>
						Saving…
					</p>
				{/if}
				{#if clipboard}
					<div
						class="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
					>
						<CopyLineIcon class="size-4 shrink-0 text-primary" />
						<span>
							Copied <span class="font-semibold">{clipboard.sessionName}</span> — pick a day below to
							paste it in.
						</span>
						<button
							type="button"
							class="btn ml-auto btn-ghost btn-xs"
							onclick={() => builder.clearSessionClipboard()}
						>
							Done
						</button>
					</div>
					{#if pasteError}
						<p class="mb-3 text-xs text-error">{pasteError}</p>
					{/if}
				{/if}
				<div class="overflow-x-auto">
					<div class="sticky left-0 z-10 mb-2 flex w-fit items-center gap-2 bg-base-100 pr-3">
						<span class="font-mono text-xs text-base-content/50">Week {expandedWeekIndex + 1}</span>
						<button
							type="button"
							class="btn btn-outline btn-xs btn-error"
							onclick={() => handleDeleteWeek(expandedWeek.id)}
						>
							<Delete3LineIcon class="size-4" />
							Delete week
						</button>
					</div>

					<WeekDayGrid
						weekId={expandedWeek.id}
						sessions={expandedWeek.sessions}
						{clipboard}
						expandedSessionId={builder.expandedSessionId}
						pendingSessionIds={builder.pendingSessionIds}
						{pasteBusy}
						onToggleSession={(sessionId) => builder.toggleSession(sessionId)}
						onAddSession={(dayNumber) =>
							builder.openModal({
								type: 'session',
								weekId: expandedWeek.id,
								dayNumber,
								sessionId: null
							})}
						onPasteInto={handlePasteInto}
					/>
				</div>

				{#if expandedSession}
					{@const sessionPending = builder.pendingSessionIds.has(expandedSession.id)}
					<div class="mt-3" class:opacity-60={sessionPending} inert={sessionPending}>
						<div class="mb-2 flex items-center justify-between border-b border-base-300 pb-2">
							<span class="font-semibold">{expandedSession.name}</span>
							<span class="flex gap-1">
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									aria-label={`Copy ${expandedSession.name} to another day`}
									onclick={() => builder.copySession(expandedSession.id)}
								>
									<CopyLineIcon class="size-4" />
									Copy
								</button>
								<button
									type="button"
									class="btn btn-square btn-ghost btn-xs"
									aria-label="Rename session"
									onclick={() =>
										builder.openModal({
											type: 'session',
											weekId: expandedWeek.id,
											dayNumber: expandedSession.dayNumber,
											sessionId: expandedSession.id
										})}
								>
									<EditBoxLineIcon class="size-4" />
								</button>
								<button
									type="button"
									class="btn btn-square text-error btn-ghost btn-xs"
									aria-label="Remove session"
									onclick={() => handleDeleteSession(expandedSession.id)}
								>
									<Delete3LineIcon class="size-4" />
								</button>
							</span>
						</div>

						{#if builder.opError}
							<p class="mt-2 text-xs text-error">{builder.opError}</p>
						{/if}

						<ExerciseDragList
							exercises={expandedSession.exercises}
							pendingExerciseIds={builder.pendingExerciseIds}
							onReorder={(id, toIndex) => builder.moveExerciseTo(id, toIndex)}
							onEdit={(programExerciseId) =>
								builder.openModal({
									type: 'exercise',
									sessionId: expandedSession.id,
									programExerciseId
								})}
							onRemove={handleDeleteExercise}
						/>

						<div class="mt-2 flex gap-2">
							<button
								type="button"
								class="btn flex-1 btn-dash btn-primary"
								onclick={() =>
									builder.openModal({
										type: 'exercise',
										sessionId: expandedSession.id,
										programExerciseId: null
									})}
							>
								<AddFillIcon class="size-4" />
								Add exercise
							</button>
							<button
								type="button"
								class="btn btn-dash"
								onclick={() =>
									builder.openModal({
										type: 'exercise',
										sessionId: expandedSession.id,
										programExerciseId: null,
										mode: 'note'
									})}
							>
								<Message3LineIcon class="size-5" />
								Add note
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</section>
