<script lang="ts">
	import LeftFillIcon from '@iconify-svelte/mingcute/left-fill';
	import RightFillIcon from '@iconify-svelte/mingcute/right-fill';
	import type { DayStatus } from '$lib/complete';

	let {
		selectedDate,
		dayStatus,
		onselect,
		highlightWeekOf
	}: {
		selectedDate: Date;
		dayStatus: (dateKey: string) => DayStatus;
		onselect: (date: Date) => void;
		/** When set, tints the whole calendar row containing this date — used
		 * by the Training page toolbar so it's visually clear which week
		 * Assign/Copy/Shift etc. actually apply to. */
		highlightWeekOf?: Date;
	} = $props();

	const dotColor: Record<DayStatus, string> = {
		none: '',
		exists: 'bg-error',
		in_progress: 'bg-warning',
		complete: 'bg-success'
	};

	let offset = $state(0);

	const viewDate = $derived(
		new Date(selectedDate.getFullYear(), selectedDate.getMonth() + offset, 1)
	);

	const today = $derived(new Date());

	const cells = $derived.by(() => {
		const year = viewDate.getFullYear();
		const month = viewDate.getMonth();
		const firstDay = new Date(year, month, 1);
		const startOffset = (firstDay.getDay() + 6) % 7;
		const daysInMonth = new Date(year, month + 1, 0).getDate();

		const blanks = Array.from({ length: startOffset }, () => null as Date | null);
		const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
		return [...blanks, ...days];
	});

	const monthLabel = $derived(
		viewDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
	);

	function changeMonth(delta: number) {
		offset += delta;
	}

	function select(date: Date) {
		offset = 0;
		onselect(date);
	}

	function isToday(date: Date) {
		return (
			date.getDate() === today.getDate() &&
			date.getMonth() === today.getMonth() &&
			date.getFullYear() === today.getFullYear()
		);
	}

	function isSelected(date: Date) {
		return (
			date.getDate() === selectedDate.getDate() &&
			date.getMonth() === selectedDate.getMonth() &&
			date.getFullYear() === selectedDate.getFullYear()
		);
	}

	function startOfDay(date: Date) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate());
	}

	function mondayOf(date: Date) {
		const d = startOfDay(date);
		d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
		return d;
	}

	function isInHighlightedWeek(date: Date) {
		if (!highlightWeekOf) return false;
		const start = mondayOf(highlightWeekOf);
		// Plain Date: function-local scratch value for a one-off calculation,
		// never read reactively by the template.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const end = new Date(start);
		end.setDate(end.getDate() + 6);
		const day = startOfDay(date);
		return day >= start && day <= end;
	}
</script>

<div class="card w-full bg-base-100 shadow-sm">
	<div class="card-body">
		<div class="flex items-center justify-between">
			<button class="btn btn-ghost btn-sm" onclick={() => changeMonth(-1)}>
				<LeftFillIcon class="size-5" />
			</button>
			<h2 class="card-title font-display text-base uppercase">{monthLabel}</h2>
			<button class="btn btn-ghost btn-sm" onclick={() => changeMonth(1)}>
				<RightFillIcon class="size-5" />
			</button>
		</div>

		<div class="grid grid-cols-7 gap-1 text-center text-xs">
			{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as day (day)}
				<span class="py-1 font-semibold text-base-content/60">{day}</span>
			{/each}

			{#each cells as date, i (date ? date.getTime() : `blank-${i}`)}
				{#if date === null}
					<span></span>
				{:else}
					{@const status = dayStatus(date.toLocaleDateString('fr-CA'))}
					{@const selected = isSelected(date)}
					{@const todayCell = isToday(date)}
					{@const inWeek = isInHighlightedWeek(date)}
					<button
						class="relative flex aspect-square items-center justify-center rounded-lg border-2 pb-2 text-sm transition-colors hover:bg-primary/20 {inWeek
							? 'bg-primary/10'
							: ''} {selected ? 'border-primary' : 'border-transparent'} {todayCell
							? 'font-bold'
							: ''}"
						onclick={() => select(date)}
					>
						{date.getDate()}
						{#if status !== 'none'}
							<span class="absolute bottom-1 h-1.5 w-1.5 rounded-full {dotColor[status]}"></span>
						{/if}
					</button>
				{/if}
			{/each}
		</div>
	</div>
</div>
