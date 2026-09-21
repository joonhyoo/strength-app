<script lang="ts">
	import NumberStepper from './NumberStepper.svelte';
	import { CATEGORY_LABEL, CATEGORY_OPTIONS } from '$lib/data/categories';
	import type { ExerciseDef } from '$lib/data/exerciseLibrary.svelte';
	import type { ExerciseCategory } from '$lib/types';

	const NOTE_MAX_HEIGHT_PX = 192; // matches max-h-48

	// The seed-form/test derivations (category, isWeight, canSave) and the
	// submit flow stay in each modal — this component only owns the shared
	// field markup, so both the program-builder and training add/edit modals
	// render one identical form.
	let {
		library,
		category,
		isNote,
		isEditing,
		isWeight,
		creatingNew = $bindable(false),
		selectedName = $bindable(''),
		newName = $bindable(''),
		newCategory = $bindable('warmup'),
		videoUrl = $bindable(''),
		sets = $bindable(3),
		reps = $bindable(5),
		note = $bindable('')
	}: {
		library: ExerciseDef[];
		category: ExerciseCategory | 'note';
		isNote: boolean;
		isEditing: boolean;
		isWeight: boolean;
		creatingNew: boolean;
		selectedName: string;
		newName: string;
		newCategory: ExerciseCategory;
		videoUrl: string;
		sets: number;
		reps: number;
		note: string;
	} = $props();

	const supportsFieldSizing = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

	// `value` is unused in the body (resize reads node.scrollHeight directly)
	// but is required so `update` re-fires when the bound value changes.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function autoGrowNote(node: HTMLTextAreaElement, _value: string) {
		if (supportsFieldSizing) return {};

		const resize = () => {
			node.style.height = 'auto';
			node.style.height = `${Math.min(node.scrollHeight, NOTE_MAX_HEIGHT_PX)}px`;
		};

		resize();
		node.addEventListener('input', resize);

		return {
			update: resize,
			destroy: () => node.removeEventListener('input', resize)
		};
	}
</script>

{#if !isNote && !creatingNew}
	<label class="flex w-full flex-col gap-1.5">
		<span class="label">Exercise</span>
		<select class="select w-full" bind:value={selectedName}>
			{#each CATEGORY_OPTIONS as cat (cat)}
				{@const items = library.filter((item) => item.category === cat)}
				{#if items.length > 0}
					<optgroup label={CATEGORY_LABEL[cat]}>
						{#each items as item (item.name)}
							<option value={item.name}>{item.name}</option>
						{/each}
					</optgroup>
				{/if}
			{/each}
		</select>
		<span class="text-xs text-base-content/60">
			Category: {CATEGORY_LABEL[category === 'note' ? 'warmup' : category]}
		</span>
	</label>

	<label class="flex w-full flex-col gap-1.5">
		<span class="label">Video link (optional)</span>
		<input
			class="input w-full"
			type="url"
			placeholder="https://youtube.com/watch?v=..."
			bind:value={videoUrl}
		/>
		<span class="text-xs text-base-content/60">
			Shown to the athlete under this exercise. Plays inside the app.
		</span>
	</label>
{/if}

{#if !isNote && creatingNew}
	<label class="flex w-full flex-col gap-1.5">
		<span class="label">Exercise name</span>
		<input
			class="input w-full"
			type="text"
			placeholder="e.g. Barbell Back Squat"
			bind:value={newName}
		/>
	</label>

	<label class="flex w-full flex-col gap-1.5">
		<span class="label">Category</span>
		<select class="select w-full" bind:value={newCategory}>
			{#each CATEGORY_OPTIONS as cat (cat)}
				<option value={cat}>{CATEGORY_LABEL[cat]}</option>
			{/each}
		</select>
	</label>

	<label class="flex w-full flex-col gap-1.5">
		<span class="label">Video link (optional)</span>
		<input
			class="input w-full"
			type="url"
			placeholder="https://youtube.com/watch?v=..."
			bind:value={videoUrl}
		/>
		<span class="text-xs text-base-content/60">
			Shown to the athlete under this exercise. Plays inside the app.
		</span>
	</label>
{/if}

{#if !isNote && !isEditing}
	<label class="flex items-center gap-2">
		<input type="checkbox" class="toggle toggle-sm" bind:checked={creatingNew} />
		New exercise
	</label>
{/if}

{#if isWeight}
	<div class="grid grid-cols-2 gap-4">
		<NumberStepper label="Sets" bind:value={sets} />
		<NumberStepper label="Reps per set" bind:value={reps} />
	</div>
{/if}

<label class="flex w-full flex-col gap-1.5">
	<span class="label">{isNote ? 'Note for the athlete' : 'Note'}</span>
	<textarea
		use:autoGrowNote={note}
		class="textarea field-sizing-content max-h-48 w-full resize-none"
		rows={isNote ? 4 : 3}
		placeholder={isNote
			? 'e.g. Deload week — leave 2 reps in the tank on every set.'
			: isWeight
				? 'e.g. 4s eccentric, explode up.'
				: 'e.g. 3 x 5\nReset between every jump.'}
		bind:value={note}
	></textarea>
</label>
