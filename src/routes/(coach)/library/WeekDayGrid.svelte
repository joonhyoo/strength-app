<script lang="ts">
	import AddFillIcon from '@iconify-svelte/mingcute/add-fill';
	import PasteLineIcon from '@iconify-svelte/mingcute/paste-line';
	import type { SvelteSet } from 'svelte/reactivity';
	import type { SessionDetail } from '$lib/types';

	interface SessionClipboard {
		sessionId: string;
		sessionName: string;
		sourceWeekId: string;
		sourceDayNumber: number;
	}

	let {
		weekId,
		sessions,
		clipboard,
		expandedSessionId,
		pendingSessionIds,
		pasteBusy,
		onToggleSession,
		onAddSession,
		onPasteInto
	}: {
		weekId: string;
		sessions: SessionDetail[];
		clipboard: SessionClipboard | null;
		expandedSessionId: string | null;
		pendingSessionIds: SvelteSet<string>;
		pasteBusy: boolean;
		onToggleSession: (sessionId: string) => void;
		onAddSession: (dayNumber: number) => void;
		onPasteInto: (
			dayNumber: number,
			dowLabel: string,
			existing: { name: string } | undefined
		) => void;
	} = $props();

	const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
</script>

<div class="grid min-w-[640px] grid-cols-7 gap-2">
	{#each DOW as dowLabel, i (dowLabel)}
		{@const dayNumber = i + 1}
		{@const session = sessions.find((s) => s.dayNumber === dayNumber)}
		{#if clipboard}
			{@const isSource =
				clipboard.sourceWeekId === weekId && clipboard.sourceDayNumber === dayNumber}
			<button
				type="button"
				class="flex min-h-[4.6rem] flex-col gap-1 rounded-lg border p-2 text-left transition-colors disabled:opacity-60 {isSource
					? 'border-base-300 bg-base-200 opacity-60'
					: 'border-dashed border-primary/60 bg-primary/5 hover:bg-primary/15'}"
				disabled={isSource || pasteBusy}
				onclick={() => onPasteInto(dayNumber, dowLabel, session)}
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
			{@const isOpen = expandedSessionId === session.id}
			{@const sessionPending = pendingSessionIds.has(session.id)}
			<button
				type="button"
				class="min-h-[4.6rem] rounded-lg border p-2 text-left {isOpen
					? 'border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]'
					: 'border-base-300 bg-base-100 hover:border-primary'}"
				class:animate-pulse={sessionPending}
				inert={sessionPending}
				onclick={() => onToggleSession(session.id)}
			>
				<span class="text-xs font-semibold tracking-wide text-base-content/60 uppercase"
					>{dowLabel}</span
				>
				<span class="mt-1 block text-sm font-semibold">{session.name}</span>
				<span class="text-[0.66rem] text-base-content/50"
					>{session.exercises.length} exercise{session.exercises.length === 1 ? '' : 's'}</span
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
					onclick={() => onAddSession(dayNumber)}
				>
					<AddFillIcon class="inline size-4" /> Add session
				</button>
			</div>
		{/if}
	{/each}
</div>
