<script lang="ts">
	import AddFillIcon from '@iconify-svelte/mingcute/add-fill';

	// Matches the athlete workout modal's ghost nav-button treatment
	// (train/WorkoutModal.svelte's navBtn) — color-only feedback, no
	// border or background, so it stays consistent across the app.
	const stepBtn =
		'flex size-9 cursor-pointer items-center justify-center rounded-full text-base-content/80 transition-colors duration-150 active:text-base-content/45';

	let {
		label,
		value = $bindable(1),
		min = 1
	}: {
		/** Shown above the control; also fills the buttons' aria-labels. */
		label: string;
		/** Two-way bound; clamped to `min` on the decrement button. */
		value: number;
		min?: number;
	} = $props();
</script>

<label class="flex w-full flex-col gap-1.5">
	<span class="label">{label}</span>
	<div class="flex items-center justify-center gap-4">
		<button
			type="button"
			class={stepBtn}
			aria-label={`Decrease ${label.toLowerCase()}`}
			onclick={() => (value = Math.max(min, value - 1))}
		>
			<span class="block h-1 w-4 rounded-full bg-current" aria-hidden="true"></span>
		</button>
		<input class="input w-16 text-center" type="number" {min} bind:value />
		<button
			type="button"
			class={stepBtn}
			aria-label={`Increase ${label.toLowerCase()}`}
			onclick={() => (value += 1)}
		>
			<AddFillIcon class="size-4" />
		</button>
	</div>
</label>
