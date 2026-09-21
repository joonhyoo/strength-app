import type { ExerciseCategory } from '$lib/types';
import { postApi } from '$lib/services/api';
import { runWrite, writeQueueBusy } from '$lib/writeQueue.svelte';

export type ExerciseDef = {
	id: string;
	name: string;
	category: ExerciseCategory;
	videoUrl?: string;
};

/** Row shape as it comes back from Supabase (snake_case, nullable) — mapped to
 *  the camelCase `ExerciseDef` the rest of the app reads. `category` is a plain
 *  string here because the generated DB types don't carry the CHECK constraint;
 *  `fromRow` is the one place that narrows it. */
export type ExerciseRow = {
	id: string;
	name: string;
	category: string;
	video_url: string | null;
};

function fromRow(row: ExerciseRow): ExerciseDef {
	return {
		id: row.id,
		name: row.name,
		category: row.category as ExerciseCategory,
		videoUrl: row.video_url ?? undefined
	};
}

const byName = (a: ExerciseDef, b: ExerciseDef) => a.name.localeCompare(b.name);

let exercises = $state<ExerciseDef[]>([]);
// Reactive: the Library page derives its catalog view from `loaded` +
// `exercises` so an exercise created from a program-builder modal shows up
// there without a reload.
let loaded = $state(false);

export function getExerciseLibrary() {
	return exercises;
}

/** Whether the catalog has been seeded yet — lets a consumer tell "empty
 *  catalog" apart from "not loaded". */
export function isExerciseLibraryLoaded() {
	return loaded;
}

export function findExercise(name: string): ExerciseDef | undefined {
	return exercises.find((e) => e.name === name);
}

/** Called once by the (coach) layout with its streamed catalog query. */
export function seedExerciseLibrary(data: ExerciseRow[]) {
	if (loaded) return;
	exercises = data.map(fromRow);
	loaded = true;
}

/** Every `/api/exercises` call, normalised to `{ ok, data | error }` — see `postApi`. */
const postExercise = (action: string, data: Record<string, unknown>) =>
	postApi('/api/exercises', action, data);

/**
 * The three catalog mutations below route through the shared serial write
 * queue: a row is added, changed, or removed in `exercises` only once the
 * server confirms, so the Library page and every exercise picker only ever
 * show genuinely saved rows. A failure resolves `{ ok: false }` and changes
 * nothing in the list. `exercises` is reassigned (never mutated) on each
 * applied write, so $derived consumers re-render — holding the old array
 * reference is a free snapshot, though nothing rolls back anymore.
 */

/** True while any catalog write is queued or running — disables the Library
 *  page's add/edit/delete buttons mid-save. Backed by the shared write queue,
 *  so it's also true while a program-builder or training write is in flight. */
export function getExerciseLibraryBusy(): boolean {
	return writeQueueBusy();
}

export async function addExerciseDefinition(def: {
	name: string;
	category: ExerciseCategory;
	videoUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
	// Already in the catalog (e.g. just added from another modal) — no-op.
	if (exercises.some((e) => e.name === def.name)) return { ok: true };

	return runWrite(async () => {
		const res = await postExercise('create', def);
		if (!res.ok) return { ok: false, error: res.error ?? 'Failed to add exercise' };
		exercises = [...exercises, { id: (res.data as { id: string }).id, ...def }].sort(byName);
		return { ok: true };
	});
}

export async function updateExerciseDefinition(def: {
	id: string;
	name: string;
	category: ExerciseCategory;
	videoUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
	return runWrite(async () => {
		const res = await postExercise('update', def);
		if (!res.ok) return { ok: false, error: res.error ?? 'Failed to update exercise' };
		exercises = exercises
			.map((e) =>
				e.id === def.id
					? { ...e, name: def.name, category: def.category, videoUrl: def.videoUrl }
					: e
			)
			.sort(byName);
		return { ok: true };
	});
}

export async function deleteExerciseDefinition(
	id: string
): Promise<{ ok: boolean; error?: string }> {
	return runWrite(async () => {
		const res = await postExercise('delete', { id });
		if (!res.ok) return { ok: false, error: res.error ?? 'Failed to delete exercise' };
		exercises = exercises.filter((e) => e.id !== id);
		return { ok: true };
	});
}
