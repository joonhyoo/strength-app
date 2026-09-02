<script lang="ts">
	import { page } from '$app/state';
	import {
		getExerciseLibrary,
		isExerciseLibraryLoaded,
		seedExerciseLibrary,
		addExerciseDefinition,
		updateExerciseDefinition,
		deleteExerciseDefinition,
		type ExerciseDef
	} from '$lib/data/exerciseLibrary.svelte';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import type { ExerciseCategory } from '$lib/types';
	import { CATEGORY_LABEL, CATEGORY_OPTIONS } from '$lib/data/categories';
	import { initProgramBuilderState } from '$lib/programBuilderState.svelte';
	import ProgramList from './ProgramList.svelte';
	import ProgramEditor from './ProgramEditor.svelte';

	const builder = initProgramBuilderState();

	$effect(() => {
		builder.loadPrograms();
	});

	// The catalog view is the shared library module, not a local copy — so an
	// exercise created from a program-builder modal (which writes that module)
	// appears here on tab switch instead of only after a reload. `page.data`
	// is streamed, so this is null until the seed resolves and the page shell
	// (including the Add form) renders immediately regardless.
	$effect(() => {
		(page.data.exercises as Promise<ExerciseDef[]>).then((list) => {
			seedExerciseLibrary(list);
		});
	});

	const exercises = $derived<ExerciseDef[] | null>(
		isExerciseLibraryLoaded() ? getExerciseLibrary() : null
	);

	let tab = $state<'programs' | 'exercises'>('programs');

	let newName = $state('');
	let newCategory = $state<ExerciseCategory>('warmup');
	let adding = $state(false);
	let addError = $state('');

	async function handleAdd(e: SubmitEvent) {
		e.preventDefault();
		const name = newName.trim();
		if (!name) return;

		if (exercises?.some((ex) => ex.name.toLowerCase() === name.toLowerCase())) {
			addError = 'That exercise already exists.';
			return;
		}

		adding = true;
		addError = '';
		await addExerciseDefinition({ name, category: newCategory });
		newName = '';
		adding = false;
	}

	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editCategory = $state<ExerciseCategory>('warmup');
	let editError = $state('');
	let saving = $state(false);
	let deletingId = $state<string | null>(null);
	let rowError = $state<{ id: string; message: string } | null>(null);

	function startEdit(item: ExerciseDef) {
		editingId = item.id;
		editName = item.name;
		editCategory = item.category;
		editError = '';
		rowError = null;
	}

	function cancelEdit() {
		editingId = null;
		editError = '';
	}

	async function saveEdit(e: SubmitEvent) {
		e.preventDefault();
		if (!editingId) return;

		const name = editName.trim();
		if (!name) return;

		saving = true;
		editError = '';
		const result = await updateExerciseDefinition({ id: editingId, name, category: editCategory });
		saving = false;

		if (!result.ok) {
			editError = result.error ?? 'Failed to update exercise.';
			return;
		}

		editingId = null;
	}

	async function handleDelete(item: ExerciseDef) {
		if (!confirm(`Warning: are you sure you want to delete "${item.name}"?`)) return;

		deletingId = item.id;
		rowError = null;
		const result = await deleteExerciseDefinition(item.id);
		deletingId = null;

		if (!result.ok) {
			rowError = { id: item.id, message: result.error ?? 'Failed to delete exercise.' };
			return;
		}
	}
</script>

<svelte:head>
	<title>Strength App — Library</title>
</svelte:head>

<div class="my-4">
	<h1 class="mb-4 text-xl font-bold">Library</h1>

	<div class="tabs-boxed mb-4 tabs w-fit">
		<button
			type="button"
			class="tab {tab === 'programs' ? 'tab-active' : ''}"
			onclick={() => (tab = 'programs')}
		>
			Programs
		</button>
		<button
			type="button"
			class="tab {tab === 'exercises' ? 'tab-active' : ''}"
			onclick={() => (tab = 'exercises')}
		>
			Exercises
		</button>
	</div>

	{#if tab === 'programs'}
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
			<ProgramList />
			<div>
				<ProgramEditor />
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
			<div class="card h-fit bg-base-100 shadow-sm">
				<div class="card-body">
					<h2 class="card-title text-base">Add exercise</h2>
					<form class="flex flex-col gap-3" onsubmit={handleAdd}>
						<label class="form-control w-full">
							<span class="label">Name</span>
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
						{#if addError}
							<p class="text-xs text-error">{addError}</p>
						{/if}
						<button type="submit" class="btn btn-primary" disabled={adding || !newName.trim()}>
							{adding ? 'Adding...' : 'Add exercise'}
						</button>
					</form>
				</div>
			</div>

			<div class="card bg-base-100 shadow-sm">
				<div class="card-body">
					<h2 class="card-title text-base">Exercise catalog</h2>
					{#if exercises === null}
						<div class="mt-2 flex flex-col gap-2">
							{#each [0, 1, 2, 3] as n (n)}
								<div class="h-5 w-full skeleton"></div>
							{/each}
						</div>
					{:else if exercises.length === 0}
						<p class="py-6 text-center text-base-content/60">No exercises yet.</p>
					{:else}
						{#each CATEGORY_OPTIONS as cat (cat)}
							{@const items = exercises.filter((ex) => ex.category === cat)}
							{#if items.length > 0}
								<div class="mt-3 first:mt-0">
									<h3
										class="mb-1 text-xs font-semibold tracking-wide text-base-content/60 uppercase"
									>
										{CATEGORY_LABEL[cat]}
									</h3>
									<ul class="flex flex-col divide-y divide-base-200">
										{#each items as item (item.id)}
											<li class="py-2">
												{#if editingId === item.id}
													<form class="flex flex-col gap-2" onsubmit={saveEdit}>
														<div class="flex gap-2">
															<input
																class="input-bordered input input-sm w-full"
																type="text"
																bind:value={editName}
															/>
															<select
																class="select-bordered select select-sm"
																bind:value={editCategory}
															>
																{#each CATEGORY_OPTIONS as c (c)}
																	<option value={c}>{CATEGORY_LABEL[c]}</option>
																{/each}
															</select>
														</div>
														{#if editError}
															<p class="text-xs text-error">{editError}</p>
														{/if}
														<div class="flex gap-2">
															<button
																type="submit"
																class="btn btn-xs btn-primary"
																disabled={saving || !editName.trim()}
															>
																{saving ? 'Saving...' : 'Save'}
															</button>
															<button
																type="button"
																class="btn btn-ghost btn-xs"
																onclick={cancelEdit}
															>
																Cancel
															</button>
														</div>
													</form>
												{:else}
													<div class="flex items-center justify-between gap-2 text-sm">
														<span>{item.name}</span>
														<div class="flex shrink-0 gap-1">
															<button
																type="button"
																class="btn btn-ghost btn-xs"
																onclick={() => startEdit(item)}
															>
																Edit
															</button>
															<button
																type="button"
																class="btn text-error btn-ghost btn-xs"
																aria-label={`Delete ${item.name}`}
																disabled={deletingId === item.id}
																onclick={() => handleDelete(item)}
															>
																{#if deletingId === item.id}
																	<span class="loading loading-xs loading-spinner"></span>
																{:else}
																	<Delete3LineIcon height="1.2em" />
																{/if}
															</button>
														</div>
													</div>
													{#if rowError?.id === item.id}
														<p class="mt-1 text-xs text-error">{rowError.message}</p>
													{/if}
												{/if}
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						{/each}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
