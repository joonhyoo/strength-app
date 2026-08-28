import type { ExerciseCategory } from '$lib/types';

export type ExerciseDef = { id: string; name: string; category: ExerciseCategory };

let exercises = $state<ExerciseDef[]>([]);
let loaded = false;

export function getExerciseLibrary() {
	return exercises;
}

export function findExercise(name: string): ExerciseDef | undefined {
	return exercises.find((e) => e.name === name);
}

export function seedExerciseLibrary(data: ExerciseDef[]) {
	if (loaded) return;
	exercises = data;
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
		const { data } = await res.json();
		exercises = data;
		loaded = true;
	}
}

export async function addExerciseDefinition(def: {
	name: string;
	category: ExerciseCategory;
}): Promise<void> {
	const res = await fetch('/api/exercises', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'create', data: def })
	});

	if (res.ok) {
		const { data } = await res.json();
		if (!exercises.some((e) => e.name === def.name)) {
			exercises = [...exercises, { id: data.id, ...def }].sort((a, b) =>
				a.name.localeCompare(b.name)
			);
		}
	}
}

export async function updateExerciseDefinition(def: {
	id: string;
	name: string;
	category: ExerciseCategory;
}): Promise<{ ok: boolean; error?: string }> {
	const res = await fetch('/api/exercises', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'update', data: def })
	});

	if (!res.ok) {
		const body = await res.json().catch(() => null);
		return { ok: false, error: body?.message ?? 'Failed to update exercise' };
	}

	exercises = exercises
		.map((e) => (e.id === def.id ? { ...e, name: def.name, category: def.category } : e))
		.sort((a, b) => a.name.localeCompare(b.name));
	return { ok: true };
}

export async function deleteExerciseDefinition(
	id: string
): Promise<{ ok: boolean; error?: string }> {
	const res = await fetch('/api/exercises', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'delete', data: { id } })
	});

	if (!res.ok) {
		const body = await res.json().catch(() => null);
		return { ok: false, error: body?.message ?? 'Failed to delete exercise' };
	}

	exercises = exercises.filter((e) => e.id !== id);
	return { ok: true };
}
