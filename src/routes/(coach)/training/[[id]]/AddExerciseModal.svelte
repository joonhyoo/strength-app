<script lang="ts">
	import { untrack } from 'svelte';
	import ExerciseForm from '$lib/components/ExerciseForm.svelte';
	import { getCoachProgramState } from '$lib/coachProgramState.svelte';
	import {
		getExerciseLibrary,
		findExercise,
		addExerciseDefinition,
		updateExerciseDefinition
	} from '$lib/data/exerciseLibrary.svelte';
	import type { Exercise, ExerciseCategory } from '$lib/types';

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
			<ExerciseForm
				{library}
				{category}
				{isNote}
				{isEditing}
				{isWeight}
				bind:creatingNew
				bind:selectedName
				bind:newName
				bind:newCategory
				bind:videoUrl
				bind:sets
				bind:reps
				bind:note
			/>

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
