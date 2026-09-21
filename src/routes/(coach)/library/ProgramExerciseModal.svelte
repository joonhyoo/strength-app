<script lang="ts">
	import { untrack } from 'svelte';
	import ExerciseForm from '$lib/components/ExerciseForm.svelte';
	import { getProgramBuilderState } from '$lib/programBuilderState.svelte';
	import { locateExercise } from '$lib/programBuilderTree';
	import {
		getExerciseLibrary,
		findExercise,
		addExerciseDefinition,
		updateExerciseDefinition
	} from '$lib/data/exerciseLibrary.svelte';
	import type { ProgramExerciseInput } from '$lib/services/programTemplateService.svelte';
	import type { ExerciseCategory } from '$lib/types';

	const builder = getProgramBuilderState();

	const library = $derived(getExerciseLibrary());

	const modal = $derived(builder.modal);
	const sessionId = $derived(modal?.type === 'exercise' ? modal.sessionId : '');
	const editingExerciseId = $derived(modal?.type === 'exercise' ? modal.programExerciseId : null);

	const editingExercise = $derived.by(() => {
		if (!editingExerciseId || !builder.selectedProgram) return null;
		const loc = locateExercise(builder.selectedProgram, editingExerciseId);
		return loc ? (loc.exercises[loc.index] ?? null) : null;
	});

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

	// Seed the form once, when the modal opens (it remounts on every open). The body is
	// untracked so it never subscribes to the exercise catalog: submit() mutates that catalog
	// via addExerciseDefinition(), and a re-run here mid-submit would reset the fields submit()
	// is about to read.
	$effect(() => {
		if (!builder.modal) return;

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
				reps = editing.plan[0] ?? 5;
				note = editing.note;
			} else {
				creatingNew = false;
				selectedName = library[0]?.name ?? '';
				newCategory = 'warmup';
				videoUrl = '';
				sets = 3;
				reps = 5;
				note = '';
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
	// editing an existing program exercise) shows *that* exercise's current
	// link, editable right here instead of only from the Library tab.
	$effect(() => {
		if (creatingNew) return;
		videoUrl = findExercise(selectedName)?.videoUrl ?? '';
	});

	const isEditing = $derived(editingExerciseId !== null);
	const isNote = $derived(
		(modal?.type === 'exercise' && modal.mode === 'note') || editingExercise?.category === 'note'
	);

	const category = $derived.by(() => {
		if (isNote) return 'note' as const;
		if (creatingNew) return newCategory;
		return findExercise(selectedName)?.category ?? 'warmup';
	});

	const isWeight = $derived(category === 'weight');

	const exerciseName = $derived(isNote ? 'Note' : creatingNew ? newName.trim() : selectedName);
	const canSave = $derived(isNote ? note.trim().length > 0 : exerciseName.length > 0);

	let dialog = $state() as HTMLDialogElement;
	let saving = $state(false);
	let error = $state('');

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
		// A note goes through as category 'note' / activity 'Note' with no catalog
		// write — getOrCreateExercise makes the one shared row server-side.
		const creating = !isNote && creatingNew;
		const targetSessionId = sessionId;
		const targetExerciseId = editingExerciseId;
		const input: ProgramExerciseInput = {
			activity: exerciseName,
			category,
			note: note.trim(),
			plan: isWeight ? Array(sets).fill(reps) : []
		};

		// Picking an existing catalog exercise (whether adding it fresh or
		// editing a program exercise that already uses it) also lets the video
		// link be edited right here — persist it to the catalog row if changed.
		const existing = !isNote && !creatingNew ? findExercise(selectedName) : null;
		const trimmedVideoUrl = videoUrl.trim();
		const videoUrlChanged = !!existing && (existing.videoUrl ?? '') !== trimmedVideoUrl;

		// The modal stays open while the writes run — it closes only once both
		// have succeeded, and shows the first failure inline.
		saving = true;
		error = '';

		if (creating) {
			const res = await addExerciseDefinition({
				name: input.activity,
				category: input.category,
				videoUrl: trimmedVideoUrl || undefined
			});
			if (!res.ok) {
				saving = false;
				error = res.error ?? 'Could not add the exercise to the library.';
				return;
			}
		} else if (existing && videoUrlChanged) {
			const res = await updateExerciseDefinition({
				id: existing.id,
				name: existing.name,
				category: existing.category,
				videoUrl: trimmedVideoUrl || undefined
			});
			if (!res.ok) {
				saving = false;
				error = res.error ?? 'Could not update the video link.';
				return;
			}
		}

		const res = await builder.saveExercise(targetSessionId, targetExerciseId, input);
		saving = false;
		if (!res.ok) {
			error = res.error ?? 'Could not save the exercise.';
			return;
		}
		builder.closeModal();
	}
</script>

<dialog bind:this={dialog} class="modal" onclose={() => builder.closeModal()}>
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
				<p class="text-sm text-error">{error}</p>
			{/if}

			<div class="modal-action">
				<button
					type="button"
					class="btn btn-outline btn-error"
					disabled={saving}
					onclick={() => builder.closeModal()}
				>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={!canSave || saving}>
					{#if saving}
						<span class="loading loading-xs loading-spinner"></span>
					{/if}
					Save
				</button>
			</div>
		</form>
	</div>
</dialog>
