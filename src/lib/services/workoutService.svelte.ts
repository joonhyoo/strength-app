import { SvelteMap } from 'svelte/reactivity';
import { CONDITIONING_CATEGORIES, type DayStatus } from '$lib/complete';
import type { Exercise, ExerciseCategory } from '$lib/types';

/**
 * Day + status-map caches for optimistic rendering. A service worker can't do
 * this job: every read is `POST /api/workout` and the Cache API only stores
 * GET. In-memory keeps day-swipes/status lookups instant within a session;
 * localStorage carries the last-seen data across a cold start so the UI
 * paints before the network answers. Both caches are cleared on logout (see
 * src/lib/clientCache.ts) so a shared device never shows a previous user's
 * data.
 */
// Plain Map: an internal cache, never read reactively by a template, so the
// SvelteMap proxy overhead buys nothing here.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const dayCache = new Map<string, Exercise[]>();
const CACHE_PREFIX = 'workout-day:';
const CACHE_LIMIT = 30;

const cacheKey = (athleteId: string, dateKey: string) => `${athleteId}:${dateKey}`;

export function getCachedWorkoutDay(athleteId: string, dateKey: string): Exercise[] | null {
	const key = cacheKey(athleteId, dateKey);

	const hit = dayCache.get(key);
	if (hit) return hit;

	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(CACHE_PREFIX + key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Exercise[];
		dayCache.set(key, parsed);
		return parsed;
	} catch {
		return null;
	}
}

function cacheWorkoutDay(athleteId: string, dateKey: string, exercises: Exercise[]) {
	const key = cacheKey(athleteId, dateKey);
	dayCache.set(key, exercises);

	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(exercises));

		// Keep the oldest entries from accumulating without bound.
		const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
		if (keys.length > CACHE_LIMIT) {
			for (const stale of keys.sort().slice(0, keys.length - CACHE_LIMIT)) {
				localStorage.removeItem(stale);
			}
		}
	} catch {
		// Quota or private-mode failures are not worth breaking a workout over.
	}
}

/**
 * Writes an in-place optimistic edit (a logged set, a toggled completion)
 * back into the day cache immediately, rather than leaving the persisted
 * cache lagging behind an unsaved-to-cache local mutation until the next
 * natural `getWorkoutDay` call. See WorkoutState.logSet/toggleComplete.
 */
export function updateCachedWorkoutDay(athleteId: string, dateKey: string, exercises: Exercise[]) {
	cacheWorkoutDay(athleteId, dateKey, exercises);
}

function computeDayStatus(
	exercises: { complete: boolean; category: ExerciseCategory; hasWeight: boolean }[]
): DayStatus {
	if (exercises.length === 0) return 'none';

	const done = exercises.filter((e) => {
		if (CONDITIONING_CATEGORIES.includes(e.category)) return e.complete;
		return e.hasWeight;
	}).length;

	if (done === exercises.length) return 'complete';
	if (done > 0) return 'in_progress';
	return 'exists';
}

/**
 * Derives a day's status from exercises already in hand (e.g. a day just
 * re-fetched after an edit), so a status-map dot can update without a
 * separate `getAthleteStatusMap` round trip.
 */
export function dayStatusFromExercises(
	exercises: Pick<Exercise, 'complete' | 'category' | 'performed'>[]
): DayStatus {
	return computeDayStatus(
		exercises.map((e) => ({
			complete: e.complete,
			category: e.category,
			hasWeight: e.performed.length > 0 && e.performed.every((p) => !!p.weight)
		}))
	);
}

export async function getWorkoutDay(athleteId: string, dateKey: string): Promise<Exercise[]> {
	const res = await fetch('/api/workout', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'getDay', data: { athleteId, dateKey } })
	});

	// A failed request is not an answer — leave any cached day standing rather than
	// caching an empty one over it.
	if (!res.ok) return [];

	const { data: workout } = await res.json();
	if (!workout) {
		cacheWorkoutDay(athleteId, dateKey, []);
		return [];
	}

	const ordered = (workout.athlete_exercises as Record<string, unknown>[])?.sort(
		(a, b) => (a.position as number) - (b.position as number)
	);

	if (!ordered) {
		cacheWorkoutDay(athleteId, dateKey, []);
		return [];
	}

	const exercises = ordered.map((row) => {
		const ex = row.exercises as { name: string; category: ExerciseCategory };
		const sets = (row.athlete_sets as Record<string, unknown>[])
			?.sort((a, b) => (a.set_number as number) - (b.set_number as number))
			.map((s) => ({
				id: s.id as string,
				set_number: s.set_number as number,
				target_reps: (s.target_reps as number) ?? 0,
				weight: s.weight != null ? String(s.weight) : undefined,
				reps: (s.reps as number) ?? undefined
			}));

		return {
			id: row.id as string,
			category: ex.category,
			activity: ex.name,
			note: (row.note as string) ?? '',
			complete: (row.complete as boolean) ?? false,
			plan: sets?.map((s) => s.target_reps) ?? [],
			performed: sets ?? []
		};
	});

	cacheWorkoutDay(athleteId, dateKey, exercises);
	return exercises;
}

const STATUS_CACHE_PREFIX = 'status-map:';
// Plain Map: an internal cache, never read reactively by a template.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const statusMapCache = new Map<string, SvelteMap<string, DayStatus>>();

export function getCachedStatusMap(athleteId: string): SvelteMap<string, DayStatus> | null {
	const hit = statusMapCache.get(athleteId);
	if (hit) return hit;

	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STATUS_CACHE_PREFIX + athleteId);
		if (!raw) return null;
		const map = new SvelteMap<string, DayStatus>(JSON.parse(raw) as [string, DayStatus][]);
		statusMapCache.set(athleteId, map);
		return map;
	} catch {
		return null;
	}
}

function cacheStatusMap(athleteId: string, map: SvelteMap<string, DayStatus>) {
	statusMapCache.set(athleteId, map);

	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STATUS_CACHE_PREFIX + athleteId, JSON.stringify([...map.entries()]));
	} catch {
		// Quota or private-mode failures are not worth breaking a workout over.
	}
}

export async function getAthleteStatusMap(
	athleteId: string,
	range?: { from: string; to: string }
): Promise<SvelteMap<string, DayStatus>> {
	const res = await fetch('/api/workout', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'getStatusMap', data: { athleteId, ...range } })
	});

	// A failed request is not an answer — leave any cached map standing
	// rather than caching an empty one over it (same reasoning as getWorkoutDay).
	if (!res.ok) return getCachedStatusMap(athleteId) ?? new SvelteMap();

	const { data: workouts } = await res.json();
	// A ranged fetch only covers part of the athlete's history — start from
	// whatever's already cached and merge in, rather than replacing it
	// wholesale and losing dots for days outside this window.
	const map = range
		? (getCachedStatusMap(athleteId) ?? new SvelteMap<string, DayStatus>())
		: new SvelteMap<string, DayStatus>();

	// Plain Map: function-local scratch space used to build `map` (the actual
	// SvelteMap returned below) — never itself read reactively.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const grouped = new Map<
		string,
		{ complete: boolean; category: ExerciseCategory; hasWeight: boolean }[]
	>();

	for (const workout of workouts) {
		const date = workout.scheduled_date as string;
		const exercises = workout.athlete_exercises as {
			complete: boolean;
			exercises: { category: ExerciseCategory };
			athlete_sets: { weight: string | null }[];
		}[];

		if (!exercises) continue;

		const list = grouped.get(date) ?? [];
		for (const exercise of exercises) {
			const hasWeight =
				exercise.athlete_sets.length > 0 && exercise.athlete_sets.every((s) => !!s.weight);
			list.push({
				complete: !!exercise.complete,
				category: exercise.exercises.category,
				hasWeight
			});
		}
		grouped.set(date, list);
	}

	for (const [date, exercises] of grouped) {
		map.set(date, computeDayStatus(exercises));
	}

	cacheStatusMap(athleteId, map);
	return map;
}
