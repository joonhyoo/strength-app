<script lang="ts">
	import EditBoxLineIcon from '@iconify-svelte/mingcute/edit-2-line';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import PlusFillIcon from '@iconify-svelte/mingcute/plus-fill';
	import CopyLineIcon from '@iconify-svelte/mingcute/copy-line';
	import PasteLineIcon from '@iconify-svelte/mingcute/paste-line';
	import Message3LineIcon from '@iconify-svelte/mingcute/message-3-line';
	import DotGridLineIcon from '@iconify-svelte/mingcute/dot-grid-line';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import { getProgramBuilderState } from '$lib/programBuilderState.svelte';
	import { CATEGORY_LABEL } from '$lib/data/categories';
	import { cycleColorCss } from '$lib/data/cycleColors';
	import { formatPlan } from '$lib/formatPlan';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { ProgramDetail, ProgramExerciseDetail } from '$lib/types';

	let { cycle }: { cycle: ProgramDetail['cycles'][number] } = $props();

	const builder = getProgramBuilderState();
	const FLIP_MS = 200;

	const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

	// Drag-and-drop reorder of the expanded session's exercise list. svelte-dnd-
	// action reorders its own `items` array, so we mirror the session's exercises
	// into local state, let `consider` stream the live shuffle into it, and push
	// the result into the builder tree on `finalize`. The mirror re-syncs from
	// the tree whenever the session (or its exercises) change out from under it.
	// Writable $derived: mirrors the session's exercises, but `consider` can
	// write the live drag order into it; it snaps back to the tree whenever the
	// session's exercises actually change.
	let dragItems = $derived<ProgramExerciseDetail[]>(
		expandedSession ? expandedSession.exercises.slice() : []
	);
	const dragDisabled = $derived(dragItems.length < 2 || builder.pendingExerciseIds.size > 0);

	function handleDndConsider(e: CustomEvent<DndEvent<ProgramExerciseDetail>>) {
		dragItems = e.detail.items;
	}
	function handleDndFinalize(e: CustomEvent<DndEvent<ProgramExerciseDetail>>) {
		dragItems = e.detail.items;
		const id = e.detail.info.id;
		const toIndex = dragItems.findIndex((x) => x.id === id);
		if (id && toIndex >= 0) builder.moveExerciseTo(id, toIndex);
	}

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

<section class="card max-w-full bg-base-100 shadow-sm">
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
					class="btn btn-ghost btn-xs"
					aria-label={`Edit ${cycle.name}`}
					onclick={() =>
						builder.openModal({ type: 'cycle', programId: cycle.id, cycleId: cycle.id })}
				>
					<EditBoxLineIcon class="size-4" />
				</button>
				<button
					type="button"
					class="btn text-error btn-ghost btn-xs"
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
				<PlusFillIcon class="size-5" />
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
						Copying week…
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
							class="btn ml-auto tracking-wider uppercase btn-ghost btn-xs"
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
							class="btn tracking-wider text-error uppercase btn-ghost btn-xs"
							onclick={() => handleDeleteWeek(expandedWeek.id)}
						>
							<Delete3LineIcon class="size-4" />
							Delete week
						</button>
					</div>

					<div class="grid min-w-[640px] grid-cols-7 gap-2">
						{#each DOW as dowLabel, i (dowLabel)}
							{@const dayNumber = i + 1}
							{@const session = expandedWeek.sessions.find((s) => s.dayNumber === dayNumber)}
							{#if clipboard}
								{@const isSource =
									clipboard.sourceWeekId === expandedWeek.id &&
									clipboard.sourceDayNumber === dayNumber}
								<button
									type="button"
									class="flex min-h-[4.6rem] flex-col gap-1 rounded-lg border p-2 text-left transition-colors disabled:opacity-60 {isSource
										? 'border-base-300 bg-base-200 opacity-60'
										: 'border-dashed border-primary/60 bg-primary/5 hover:bg-primary/15'}"
									disabled={isSource || pasteBusy}
									onclick={() => handlePasteInto(dayNumber, dowLabel, session)}
								>
									<span class="text-xs font-semibold tracking-wide text-base-content/60 uppercase"
										>{dowLabel}</span
									>
									{#if isSource}
										<span class="mt-1 text-xs text-base-content/50">Copied from here</span>
									{:else if session}
										<span class="mt-1 flex items-center gap-1 text-sm font-semibold text-primary">
											<PasteLineIcon class="size-4" /> Replace
										</span>
										<span class="truncate text-[0.66rem] text-base-content/50">{session.name}</span>
									{:else}
										<span class="mt-1 flex items-center gap-1 text-sm font-semibold text-primary">
											<PasteLineIcon class="size-4" /> Paste here
										</span>
									{/if}
								</button>
							{:else if session}
								{@const isOpen = builder.expandedSessionId === session.id}
								{@const sessionPending = builder.pendingSessionIds.has(session.id)}
								<button
									type="button"
									class="min-h-[4.6rem] rounded-lg border p-2 text-left {isOpen
										? 'border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]'
										: 'border-base-300 bg-base-100 hover:border-primary'}"
									class:animate-pulse={sessionPending}
									inert={sessionPending}
									onclick={() => builder.toggleSession(session.id)}
								>
									<span class="text-xs font-semibold tracking-wide text-base-content/60 uppercase"
										>{dowLabel}</span
									>
									<span class="mt-1 block text-sm font-semibold">{session.name}</span>
									<span class="text-[0.66rem] text-base-content/50"
										>{session.exercises.length} exercise{session.exercises.length === 1
											? ''
											: 's'}</span
									>
								</button>
							{:else}
								<div
									class="flex min-h-[4.6rem] flex-col gap-1 rounded-lg border border-base-300 bg-base-200 p-2"
								>
									<span class="text-xs font-semibold tracking-wide text-base-content/60 uppercase"
										>{dowLabel}</span
									>
									<span class="text-xs text-base-content/40">Rest</span>
									<button
										type="button"
										class="mt-auto rounded border border-dashed border-base-300 py-1 text-[0.7rem] tracking-wider text-base-content/50 uppercase hover:border-primary hover:text-primary"
										onclick={() =>
											builder.openModal({
												type: 'session',
												weekId: expandedWeek.id,
												dayNumber,
												sessionId: null
											})}
									>
										<PlusFillIcon class="inline size-4" /> Add session
									</button>
								</div>
							{/if}
						{/each}
					</div>
				</div>

				{#if expandedSession}
					{@const sessionPending = builder.pendingSessionIds.has(expandedSession.id)}
					<div class="mt-3" class:opacity-60={sessionPending} inert={sessionPending}>
						<div class="mb-2 flex items-center justify-between border-b border-base-300 pb-2">
							<span class="font-semibold">{expandedSession.name}</span>
							<span class="flex gap-1">
								<button
									type="button"
									class="btn tracking-wider uppercase btn-ghost btn-xs"
									aria-label={`Copy ${expandedSession.name} to another day`}
									onclick={() => builder.copySession(expandedSession.id)}
								>
									<CopyLineIcon class="size-4" />
									Copy
								</button>
								<button
									type="button"
									class="btn btn-ghost btn-xs"
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
									class="btn text-error btn-ghost btn-xs"
									aria-label="Remove session"
									onclick={() => handleDeleteSession(expandedSession.id)}
								>
									<Delete3LineIcon class="size-4" />
								</button>
							</span>
						</div>

						{#if builder.exerciseOpError}
							<p class="mt-2 text-xs text-error">{builder.exerciseOpError}</p>
						{/if}

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
										class:opacity-60={builder.pendingExerciseIds.has(exercise.id)}
										inert={builder.pendingExerciseIds.has(exercise.id)}
										animate:flip={{ duration: FLIP_MS }}
									>
										<CategoryIcon category={exercise.category} />
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
												class="btn text-secondary btn-ghost btn-xs"
												aria-label={`Edit ${exercise.activity}`}
												onclick={() =>
													builder.openModal({
														type: 'exercise',
														sessionId: expandedSession.id,
														programExerciseId: exercise.id
													})}
											>
												<EditBoxLineIcon class="size-5" />
											</button>
											<button
												type="button"
												class="btn text-error btn-ghost btn-xs"
												aria-label={`Remove ${exercise.activity}`}
												onclick={() => handleDeleteExercise(exercise.id)}
											>
												<Delete3LineIcon class="size-5" />
											</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}

						<div class="mt-2 flex gap-2">
							<button
								type="button"
								class="btn flex-1 border-dashed border-base-300 tracking-wider text-primary uppercase btn-neutral"
								onclick={() =>
									builder.openModal({
										type: 'exercise',
										sessionId: expandedSession.id,
										programExerciseId: null
									})}
							>
								<PlusFillIcon class="size-5" />
								Add exercise
							</button>
							<button
								type="button"
								class="btn border-dashed border-base-300 tracking-wider text-base-content/70 uppercase btn-neutral"
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
