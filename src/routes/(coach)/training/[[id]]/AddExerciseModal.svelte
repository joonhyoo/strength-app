<script lang="ts">
	import { untrack } from 'svelte';
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import {
		getExerciseLibrary,
		findExercise,
		addExerciseDefinition,
		loadExerciseLibrary
	} from '$lib/data/exerciseLibrary.svelte';
	import type { Exercise, ExerciseCategory } from '$lib/types';
	import { CATEGORY_LABEL, CATEGORY_OPTIONS } from '$lib/data/categories';

	const NOTE_MAX_HEIGHT_PX = 192; // matches max-h-48

	const supportsFieldSizing = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

	// `value` is unused in the body (resize reads node.scrollHeight directly)
	// but is required so `update` re-fires when the bound value changes.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function autoGrowNote(node: HTMLTextAreaElement, value: string) {
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

	const program = getCoachProgramState();

	const library = $derived(getExerciseLibrary());
	const editingExercise = $derived(program.editingExercise);

	let creatingNew = $state(false);
	let selectedName = $state('');
	let newName = $state('');
	let newCategory = $state<ExerciseCategory>('warmup');
	let sets = $state(3);
	let reps = $state(5);
	let note = $state('');
	let complete = $state(false);

	$effect(() => {
		loadExerciseLibrary();
	});

	// Seed the form once, when the modal opens (it remounts on every open). The body is
	// untracked so it never subscribes to the exercise catalog: submit() mutates that catalog
	// via addExerciseDefinition(), and a re-run here mid-submit would reset the fields submit()
	// is about to read.
	$effect(() => {
		if (!program.modalOpen) return;

		untrack(() => {
			const editing = editingExercise;
			if (editing) {
				const inLibrary = !!findExercise(editing.activity);
				creatingNew = !inLibrary;
				selectedName = inLibrary ? editing.activity : (library[0]?.name ?? '');
				newName = editing.activity;
				newCategory = editing.category;
				sets = editing.plan.length || 3;
				reps = (editing.plan[0] as number) ?? 5;
				note = editing.note;
				complete = editing.complete;
			} else {
				creatingNew = false;
				selectedName = library[0]?.name ?? '';
				newCategory = 'warmup';
				sets = 3;
				reps = 5;
				note = '';
				complete = false;
			}
		});
	});

	// If the catalog streams in after the modal opened, adopt a default selection — but only
	// if the coach hasn't already picked or started typing one.
	$effect(() => {
		const first = library[0]?.name;
		if (first) {
			untrack(() => {
				if (!creatingNew && selectedName === '') selectedName = first;
			});
		}
	});

	const isEditing = $derived(program.editingExercise !== null);

	const category = $derived.by(() => {
		if (creatingNew) return newCategory;
		return findExercise(selectedName)?.category ?? 'warmup';
	});

	const isWeight = $derived(category === 'weight');

	const exerciseName = $derived(creatingNew ? newName.trim() : selectedName);

	let dialog = $state() as HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
		return () => {
			if (dialog.open) dialog.close();
		};
	});

	async function submit() {
		if (!exerciseName) return;

		// Capture every reactive value before the first await. addExerciseDefinition() reassigns
		// the shared `exercises` state, whose flush re-runs the seeding $effect before this
		// function resumes — so a reactive read after the await would see reset values.
		const creating = creatingNew;
		const exercise: Exercise = {
			category,
			activity: exerciseName,
			plan: isWeight ? Array(sets).fill(reps) : [],
			performed: isWeight ? Array.from({ length: sets }, () => ({ weight: undefined, reps })) : [],
			note: note.trim(),
			complete
		};

		if (creating) {
			await addExerciseDefinition({ name: exercise.activity, category: exercise.category });
		}

		await program.saveExercise(exercise);
		program.closeModal();
	}
</script>

<dialog bind:this={dialog} class="modal" onclose={() => program.closeModal()}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">{isEditing ? 'Edit exercise' : 'Add exercise'}</h3>

		<form
			class="flex flex-col gap-4"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			{#if !creatingNew}
				<label class="form-control w-full">
					<span class="label">Exercise</span>
					<select class="select-bordered select" bind:value={selectedName}>
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
					<span class="label -mt-1 text-base-content/60">
						Category: {CATEGORY_LABEL[category]}
					</span>
				</label>
			{/if}

			{#if creatingNew}
				<label class="form-control w-full">
					<span class="label">Exercise name</span>
					<input
						class="input-bordered input"
						type="text"
						placeholder="e.g. Barbell Back Squat"
						bind:value={newName}
					/>
				</label>

				<label class="form-control w-full">
					<span class="label">Category</span>
					<select class="select-bordered select" bind:value={newCategory}>
						{#each CATEGORY_OPTIONS as cat (cat)}
							<option value={cat}>{CATEGORY_LABEL[cat]}</option>
						{/each}
					</select>
				</label>
			{/if}

			{#if !isEditing}
				<label class="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						class="toggle toggle-sm"
						bind:checked={creatingNew}
						disabled={isEditing && !editingExercise}
					/>
					New exercise
				</label>
			{/if}

			{#if isWeight}
				<div class="grid grid-cols-2 gap-4">
					<label class="form-control w-full">
						<span class="label">Sets</span>
						<input class="input-bordered input" type="number" min="1" bind:value={sets} />
					</label>
					<label class="form-control w-full">
						<span class="label">Reps per set</span>
						<input class="input-bordered input" type="number" min="1" bind:value={reps} />
					</label>
				</div>
			{/if}

			<label class="form-control w-full">
				<span class="label">Note</span>
				<textarea
					use:autoGrowNote={note}
					class="textarea-bordered textarea field-sizing-content max-h-48 resize-none"
					rows="3"
					placeholder={isWeight
						? 'e.g. 4s eccentric, explode up.'
						: 'e.g. 3 x 5\nReset between every jump.'}
					bind:value={note}
				></textarea>
			</label>

			<div class="modal-action">
				<button
					type="button"
					class="btn bg-error/10 text-error hover:bg-error/20"
					onclick={() => program.closeModal()}
				>
					Cancel
				</button>
				<button class="btn btn-primary" type="submit" disabled={!exerciseName}> Save </button>
			</div>
		</form>
	</div>
</dialog>
