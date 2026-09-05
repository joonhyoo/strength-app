<script lang="ts">
	import { page } from '$app/state';
	import {
		getExerciseLibrary,
		isExerciseLibraryLoaded,
		seedExerciseLibrary,
		addExerciseDefinition,
		updateExerciseDefinition,
		deleteExerciseDefinition,
		type ExerciseDef,
		type ExerciseRow
	} from '$lib/data/exerciseLibrary.svelte';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import PlayCircleFillIcon from '@iconify-svelte/mingcute/play-circle-fill';
	import CloseLineIcon from '@iconify-svelte/mingcute/close-line';
	import Button from '$lib/components/Button.svelte';
	import type { ExerciseCategory } from '$lib/types';
	import { CATEGORY_LABEL, CATEGORY_OPTIONS, CATEGORY_ICON } from '$lib/data/categories';
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
		(page.data.exercises as Promise<ExerciseRow[]>).then((list) => {
			seedExerciseLibrary(list);
		});
	});

	const exercises = $derived<ExerciseDef[] | null>(
		isExerciseLibraryLoaded() ? getExerciseLibrary() : null
	);

	let query = $state('');

	// Mirrors the same substring-filter pattern used on the Athletes page.
	const filteredExercises = $derived.by(() => {
		if (exercises === null) return null;
		const q = query.trim().toLowerCase();
		return q ? exercises.filter((ex) => ex.name.toLowerCase().includes(q)) : exercises;
	});

	let tab = $state<'programs' | 'exercises'>('programs');

	let newName = $state('');
	let newCategory = $state<ExerciseCategory>('warmup');
	let newVideoUrl = $state('');
	let addError = $state('');

	async function handleAdd(e: SubmitEvent) {
		e.preventDefault();
		const name = newName.trim();
		if (!name) return;

		if (exercises?.some((ex) => ex.name.toLowerCase() === name.toLowerCase())) {
			addError = 'That exercise already exists.';
			return;
		}

		// The row appears in the catalog straight away; clear the form now.
		addError = '';
		const category = newCategory;
		const videoUrl = newVideoUrl.trim() || undefined;
		newName = '';
		newVideoUrl = '';

		const res = await addExerciseDefinition({ name, category, videoUrl });
		if (!res.ok) {
			addError = res.error ?? 'Failed to add exercise.';
			newName = name;
			newVideoUrl = videoUrl ?? '';
		}
	}

	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editCategory = $state<ExerciseCategory>('warmup');
	let editVideoUrl = $state('');
	let editError = $state('');
	let rowError = $state<{ id: string; message: string } | null>(null);

	function startEdit(item: ExerciseDef) {
		editingId = item.id;
		editName = item.name;
		editCategory = item.category;
		editVideoUrl = item.videoUrl ?? '';
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

		// Close the row editor now — the change is already live in the list.
		const id = editingId;
		editError = '';
		editingId = null;

		const result = await updateExerciseDefinition({
			id,
			name,
			category: editCategory,
			videoUrl: editVideoUrl.trim() || undefined
		});

		if (!result.ok) {
			// Reopen so the coach sees the error; the edit fields still hold their attempt.
			editingId = id;
			editError = result.error ?? 'Failed to update exercise.';
		}
	}

	async function handleDelete(item: ExerciseDef) {
		if (!confirm(`Warning: are you sure you want to delete "${item.name}"?`)) return;

		rowError = null;
		const result = await deleteExerciseDefinition(item.id);
		if (!result.ok) {
			rowError = { id: item.id, message: result.error ?? 'Failed to delete exercise.' };
		}
	}
</script>

<svelte:head>
	<title>Strength App — Library</title>
</svelte:head>

<div class="my-4">
	<h1 class="mb-4 font-display text-xl font-bold uppercase">Library</h1>

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
					<h2 class="card-title font-display text-base uppercase">Add exercise</h2>
					<form class="flex flex-col gap-3" onsubmit={handleAdd}>
						<label class="form-control w-full">
							<span class="label">Name</span>
							<input
								class="input"
								type="text"
								placeholder="e.g. Barbell Back Squat"
								bind:value={newName}
							/>
						</label>
						<label class="form-control w-full">
							<span class="label">Category</span>
							<select class="select" bind:value={newCategory}>
								{#each CATEGORY_OPTIONS as cat (cat)}
									<option value={cat}>{CATEGORY_LABEL[cat]}</option>
								{/each}
							</select>
						</label>
						<label class="form-control w-full">
							<span class="label">Video link (optional)</span>
							<input
								class="input"
								type="url"
								placeholder="https://youtube.com/watch?v=..."
								bind:value={newVideoUrl}
							/>
						</label>
						{#if addError}
							<p class="text-xs text-error">{addError}</p>
						{/if}
						<Button variant="primary" type="submit" disabled={!newName.trim()}>Add exercise</Button>
					</form>
				</div>
			</div>

			<div class="card bg-base-100 shadow-sm">
				<div class="card-body">
					<h2 class="card-title font-display text-base uppercase">Exercise catalog</h2>
					{#if exercises === null}
						<div class="mt-2 flex flex-col gap-2">
							{#each [0, 1, 2, 3] as n (n)}
								<div class="h-5 w-full skeleton"></div>
							{/each}
						</div>
					{:else if exercises.length === 0}
						<p class="py-6 text-center text-base-content/60">No exercises yet.</p>
					{:else}
						<div class="relative mt-2 w-full max-w-xs">
							<input
								type="search"
								placeholder="Search exercises…"
								class="input input-sm w-full pr-8 [&::-webkit-search-cancel-button]:appearance-none"
								bind:value={query}
							/>
							{#if query}
								<button
									type="button"
									class="btn absolute top-1/2 right-1 -translate-y-1/2 px-1 btn-ghost btn-xs"
									aria-label="Clear search"
									onclick={() => (query = '')}
								>
									<CloseLineIcon class="size-4" />
								</button>
							{/if}
						</div>
						{#if !filteredExercises || filteredExercises.length === 0}
							<p class="py-6 text-center text-base-content/60">No exercises match your search.</p>
						{:else}
							{#each CATEGORY_OPTIONS as cat (cat)}
								{@const { icon: CatIcon, color } = CATEGORY_ICON[cat]}
								{@const items = filteredExercises.filter((ex) => ex.category === cat)}
								{#if items.length > 0}
									<div class="mt-3 first:mt-0">
										<h3
											class="mb-1 text-xs font-semibold tracking-wide text-base-content/60 uppercase"
										>
											{CATEGORY_LABEL[cat]} · {items.length}
										</h3>
										<ul class="flex flex-col divide-y divide-base-200">
											{#each items as item (item.id)}
												<li class="py-2">
													{#if editingId === item.id}
														<form class="flex flex-col gap-2" onsubmit={saveEdit}>
															<div class="flex gap-2">
																<input
																	class="input input-sm w-full"
																	type="text"
																	bind:value={editName}
																/>
																<select class="select select-sm" bind:value={editCategory}>
																	{#each CATEGORY_OPTIONS as c (c)}
																		<option value={c}>{CATEGORY_LABEL[c]}</option>
																	{/each}
																</select>
															</div>
															<input
																class="input input-sm w-full"
																type="url"
																placeholder="Video link (optional)"
																bind:value={editVideoUrl}
															/>
															{#if editError}
																<p class="text-xs text-error">{editError}</p>
															{/if}
															<div class="flex gap-2">
																<Button
																	variant="primary"
																	size="sm"
																	type="submit"
																	disabled={!editName.trim()}
																>
																	Save
																</Button>
																<Button
																	variant="ghost"
																	size="sm"
																	type="button"
																	onclick={cancelEdit}
																>
																	Cancel
																</Button>
															</div>
														</form>
													{:else}
														<div class="flex items-center justify-between gap-2 text-base">
															<span class="flex min-w-0 flex-1 items-center gap-2">
																<CatIcon class="size-5 {color} shrink-0" />
																<span class="truncate">{item.name}</span>
																{#if item.videoUrl}
																	<span title="Has video" class="shrink-0 text-base-content/40">
																		<PlayCircleFillIcon class="size-5" />
																	</span>
																{/if}
															</span>
															<div class="flex shrink-0 items-center gap-1">
																<Button variant="ghost" size="sm" onclick={() => startEdit(item)}>
																	Edit
																</Button>
																<button
																	type="button"
																	class="btn text-error btn-ghost btn-sm"
																	aria-label={`Delete ${item.name}`}
																	onclick={() => handleDelete(item)}
																>
																	<Delete3LineIcon class="size-5" />
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
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
