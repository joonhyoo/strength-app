<script lang="ts">
	import { untrack } from 'svelte';
	import AddFillIcon from '@iconify-svelte/mingcute/add-fill';
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import {
		getExerciseLibrary,
		findExercise,
		addExerciseDefinition,
		updateExerciseDefinition
	} from '$lib/data/exerciseLibrary.svelte';
	import type { Exercise, ExerciseCategory } from '$lib/types';
	import { CATEGORY_LABEL, CATEGORY_OPTIONS } from '$lib/data/categories';

	const NOTE_MAX_HEIGHT_PX = 192; // matches max-h-48

	// Matches the athlete workout modal's ghost nav-button treatment
	// (train/WorkoutModal.svelte's navBtn) — color-only feedback, no
	// border or background, so it stays consistent across the app.
	const stepBtn =
		'flex size-9 cursor-pointer items-center justify-center rounded-full text-base-content/80 transition-colors duration-150 active:text-base-content/45';

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
	// Shared by both branches: the new exercise's link while creating, or the
	// selected catalog exercise's existing link while picking/editing one —
	// see the sync effect below.
	let videoUrl = $state('');
	let sets = $state(3);
	let reps = $state(5);
	let note = $state('');
	let complete = $state(false);
	// A write is in flight — Save/Delete disable and a spinner shows until it
	// settles; the modal stays open on failure so the coach can retry.
	let saving = $state(false);
	let error = $state('');

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
				videoUrl = '';
				sets = editing.plan.length || 3;
				reps = (editing.plan[0] as number) ?? 5;
				note = editing.note;
				complete = editing.complete;
			} else {
				creatingNew = false;
				selectedName = library[0]?.name ?? '';
				newCategory = 'warmup';
				videoUrl = '';
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

	// Keep the video-link field in sync with whichever catalog exercise is
	// selected — picking a different one from the dropdown (including while
	// editing an existing scheduled exercise) shows *that* exercise's current
	// link, editable right here instead of only from the Library tab.
	$effect(() => {
		if (creatingNew) return;
		videoUrl = findExercise(selectedName)?.videoUrl ?? '';
	});

	const isEditing = $derived(program.editingExercise !== null);
	const isNote = $derived(program.modalMode === 'note');

	const category = $derived.by(() => {
		if (isNote) return 'note' as const;
		if (creatingNew) return newCategory;
		return findExercise(selectedName)?.category ?? 'warmup';
	});

	const isWeight = $derived(category === 'weight');

	const exerciseName = $derived(isNote ? 'Note' : creatingNew ? newName.trim() : selectedName);
	const canSave = $derived(isNote ? note.trim().length > 0 : exerciseName.length > 0);

	let dialog = $state() as HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
		return () => {
			if (dialog.open) dialog.close();
		};
	});

	async function submit() {
		if (!canSave || saving) return;

		// Capture every reactive value before the first await. addExerciseDefinition() reassigns
		// the shared `exercises` state, whose flush re-runs the seeding $effect before this
		// function resumes — so a reactive read after the await would see reset values.
		// A note goes straight through as category 'note' / activity 'Note' with no
		// catalog write — getOrCreateExercise makes the one shared row server-side.
		const creating = !isNote && creatingNew;
		const exercise: Exercise = {
			category,
			activity: exerciseName,
			plan: isWeight ? Array(sets).fill(reps) : [],
			performed: isWeight ? Array.from({ length: sets }, () => ({ weight: undefined, reps })) : [],
			note: note.trim(),
			complete: isNote ? false : complete
		};

		// Picking an existing catalog exercise (whether adding it fresh or
		// editing a scheduled exercise that already uses it) also lets the video
		// link be edited right here — persist it to the catalog row if changed.
		const existing = !isNote && !creatingNew ? findExercise(selectedName) : null;
		const trimmedVideoUrl = videoUrl.trim();
		const videoUrlChanged = !!existing && (existing.videoUrl ?? '') !== trimmedVideoUrl;
		// Add targets the focused day; edit finds its exercise by id, wherever it sits.
		const dateKey = program.selectedDateKey;
		const editingId = program.editingExercise?.id;

		saving = true;
		error = '';
		try {
			if (existing && videoUrlChanged) {
				const vres = await updateExerciseDefinition({
					id: existing.id,
					name: existing.name,
					category: existing.category,
					videoUrl: trimmedVideoUrl || undefined
				});
				if (!vres.ok) {
					error = vres.error ?? 'Could not save the video link.';
					return;
				}
			}

			if (editingId) {
				const res = await program.updateExercise(editingId, exercise);
				if (!res.ok) {
					error = res.error ?? 'Could not save the exercise.';
					return;
				}
			} else {
				// A brand-new catalog row must exist before the day references it — the
				// day-add's getOrCreateExercise would otherwise race this create on the
				// unique exercise name.
				if (creating) {
					const cres = await addExerciseDefinition({
						name: exercise.activity,
						category: exercise.category,
						videoUrl: trimmedVideoUrl || undefined
					});
					if (!cres.ok) {
						error = cres.error ?? 'Could not create the exercise.';
						return;
					}
				}
				const res = await program.addExercise(dateKey, exercise);
				if (!res.ok) {
					error = res.error ?? 'Could not add the exercise.';
					return;
				}
			}
			// Every write landed — only now does the modal close; the day list
			// refreshes from server truth (see coachProgramState's refetchDay).
			program.closeModal();
		} finally {
			saving = false;
		}
	}

	async function confirmDelete() {
		const id = editingExercise?.id;
		if (!id || saving) return;
		saving = true;
		error = '';
		const res = await program.removeExercise(id);
		saving = false;
		if (!res.ok) {
			error = res.error ?? 'Could not remove the exercise.';
		} else {
			program.closeModal();
		}
	}
</script>

<dialog bind:this={dialog} class="modal" onclose={() => program.closeModal()}>
	<div class="modal-box">
		<h3 class="mb-4 font-display text-lg font-bold uppercase">
			{isNote
				? isEditing
					? 'Edit note'
					: 'Add note'
				: isEditing
					? 'Edit exercise'
					: 'Add exercise'}
		</h3>

		<form
			class="flex flex-col gap-4 text-sm"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
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
						Category: {CATEGORY_LABEL[category]}
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
					<label class="flex w-full flex-col gap-1.5">
						<span class="label">Sets</span>
						<div class="flex items-center justify-center gap-4">
							<button
								type="button"
								class={stepBtn}
								aria-label="Decrease sets"
								onclick={() => (sets = Math.max(1, sets - 1))}
							>
								<span class="block h-1 w-4 rounded-full bg-current" aria-hidden="true"></span>
							</button>
							<input class="input w-16 text-center" type="number" min="1" bind:value={sets} />
							<button
								type="button"
								class={stepBtn}
								aria-label="Increase sets"
								onclick={() => (sets += 1)}
							>
								<AddFillIcon class="size-4" />
							</button>
						</div>
					</label>
					<label class="flex w-full flex-col gap-1.5">
						<span class="label">Reps per set</span>
						<div class="flex items-center justify-center gap-4">
							<button
								type="button"
								class={stepBtn}
								aria-label="Decrease reps"
								onclick={() => (reps = Math.max(1, reps - 1))}
							>
								<span class="block h-1 w-4 rounded-full bg-current" aria-hidden="true"></span>
							</button>
							<input class="input w-16 text-center" type="number" min="1" bind:value={reps} />
							<button
								type="button"
								class={stepBtn}
								aria-label="Increase reps"
								onclick={() => (reps += 1)}
							>
								<AddFillIcon class="size-4" />
							</button>
						</div>
					</label>
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

			{#if error}
				<p class="rounded-lg bg-error/10 px-3 py-2 text-error">{error}</p>
			{/if}

			<div class="modal-action">
				{#if isEditing}
					<button
						type="button"
						class="btn mr-auto btn-outline btn-error"
						disabled={saving}
						onclick={confirmDelete}
					>
						Delete
					</button>
				{/if}
				<button
					type="button"
					class="btn btn-outline"
					disabled={saving}
					onclick={() => program.closeModal()}
				>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={!canSave || saving}>
					{#if saving}
						<span class="loading loading-spinner loading-sm"></span>
					{/if}
					Save
				</button>
			</div>
		</form>
	</div>
</dialog>
