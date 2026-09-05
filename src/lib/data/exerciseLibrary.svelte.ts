import type { ExerciseCategory } from '$lib/types';

export type ExerciseDef = {
	id: string;
	name: string;
	category: ExerciseCategory;
	videoUrl?: string;
};

/** Row shape as it comes back from Supabase / the /api/exercises 'list' route
 *  (snake_case, nullable) — mapped to the camelCase `ExerciseDef` the rest of
 *  the app reads. */
export type ExerciseRow = {
	id: string;
	name: string;
	category: ExerciseCategory;
	video_url: string | null;
};

function fromRow(row: ExerciseRow): ExerciseDef {
	return {
		id: row.id,
		name: row.name,
		category: row.category,
		videoUrl: row.video_url ?? undefined
	};
}

const byName = (a: ExerciseDef, b: ExerciseDef) => a.name.localeCompare(b.name);

// Placeholder id for a row rendered before the server has assigned a real one;
// swapped for the real id on success, matched only by `===` (never parsed).
let tempSeq = 0;
const tempId = () => `temp-ex-${++tempSeq}`;

let exercises = $state<ExerciseDef[]>([]);
// Reactive: the Library page derives its catalog view from `loaded` +
// `exercises` so an exercise created from a program-builder modal shows up
// there without a reload.
let loaded = $state(false);

export function getExerciseLibrary() {
	return exercises;
}

/** Whether the catalog has been fetched or seeded yet — lets a consumer tell
 *  "empty catalog" apart from "not loaded". */
export function isExerciseLibraryLoaded() {
	return loaded;
}

export function findExercise(name: string): ExerciseDef | undefined {
	return exercises.find((e) => e.name === name);
}

export function seedExerciseLibrary(data: ExerciseRow[]) {
	if (loaded) return;
	exercises = data.map(fromRow);
	loaded = true;
}

export async function loadExerciseLibrary() {
	if (loaded) return;

	const res = await fetch('/api/exercises', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'list' })
	});

	if (res.ok) {
		const { data } = (await res.json()) as { data: ExerciseRow[] };
		exercises = data.map(fromRow);
		loaded = true;
	}
}

async function postExercise(action: string, data: Record<string, unknown>) {
	try {
		const res = await fetch('/api/exercises', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action, data })
		});
		if (res.ok) return { ok: true as const, data: (await res.json()).data };
		const body = await res.json().catch(() => null);
		return { ok: false as const, error: body?.message as string | undefined };
	} catch {
		return { ok: false as const, error: undefined };
	}
}

/**
 * The three catalog mutations below all apply their change to `exercises`
 * immediately and only touch the network afterwards, rolling the list back to
 * the pre-change snapshot if the request fails. `exercises` is reassigned (not
 * mutated) on every change, so holding the old array reference is a free
 * snapshot.
 */
export async function addExerciseDefinition(def: {
	name: string;
	category: ExerciseCategory;
	videoUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
	// Already in the catalog (e.g. just added from another modal) — no-op.
	if (exercises.some((e) => e.name === def.name)) return { ok: true };

	const temp: ExerciseDef = { id: tempId(), ...def };
	exercises = [...exercises, temp].sort(byName);

	const res = await postExercise('create', def);

	if (!res.ok) {
		exercises = exercises.filter((e) => e.id !== temp.id);
		return { ok: false, error: res.error ?? 'Failed to add exercise' };
	}

	exercises = exercises.map((e) => (e.id === temp.id ? { ...e, id: res.data.id } : e));
	return { ok: true };
}

export async function updateExerciseDefinition(def: {
	id: string;
	name: string;
	category: ExerciseCategory;
	videoUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
	const snapshot = exercises;
	exercises = exercises
		.map((e) =>
			e.id === def.id ? { ...e, name: def.name, category: def.category, videoUrl: def.videoUrl } : e
		)
		.sort(byName);

	const res = await postExercise('update', def);
	if (!res.ok) {
		exercises = snapshot;
		return { ok: false, error: res.error ?? 'Failed to update exercise' };
	}
	return { ok: true };
}

export async function deleteExerciseDefinition(
	id: string
): Promise<{ ok: boolean; error?: string }> {
	const snapshot = exercises;
	exercises = exercises.filter((e) => e.id !== id);

	const res = await postExercise('delete', { id });
	if (!res.ok) {
		exercises = snapshot;
		return { ok: false, error: res.error ?? 'Failed to delete exercise' };
	}
	return { ok: true };
}
