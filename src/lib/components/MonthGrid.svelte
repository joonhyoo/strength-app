<script lang="ts">
	import LeftFillIcon from '@iconify-svelte/mingcute/left-fill';
	import RightFillIcon from '@iconify-svelte/mingcute/right-fill';

	let {
		selectedDate,
		dayStatus,
		onselect
	}: {
		selectedDate: Date;
		dayStatus: (dateKey: string) => 'none' | 'exists' | 'in_progress' | 'complete';
		onselect: (date: Date) => void;
	} = $props();

	const dotColor: Record<'none' | 'exists' | 'in_progress' | 'complete', string> = {
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
</script>

<div class="card w-full bg-base-100 shadow-sm">
	<div class="card-body">
		<div class="flex items-center justify-between">
			<button class="btn btn-ghost btn-sm" onclick={() => changeMonth(-1)}>
				<LeftFillIcon height="1.2em" />
			</button>
			<h2 class="card-title text-base">{monthLabel}</h2>
			<button class="btn btn-ghost btn-sm" onclick={() => changeMonth(1)}>
				<RightFillIcon height="1.2em" />
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
					<button
						class="relative flex aspect-square items-center justify-center rounded-lg pb-2 text-sm transition-colors hover:bg-primary/20 {selected
							? 'bg-primary/40'
							: ''} {todayCell ? 'border border-primary' : ''}"
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
