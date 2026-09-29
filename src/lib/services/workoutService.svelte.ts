import { SvelteMap } from 'svelte/reactivity';
import { countsTowardCompletion, exerciseComplete, type DayStatus } from '$lib/complete';
import type { Exercise, ExerciseCategory, SetEntry } from '$lib/types';
import { fetchApi } from './api';

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
// v2: a cached day written before per-unit completion carried its state as
// `Exercise.complete` and had no `performed[].done`, so reading one back would
// show every tapped circuit as untapped. Bumping the prefix orphans those
// entries rather than needing a shape check on the read path; the prefix is
// listed in clearClientCaches (clientCache.ts) so old keys are purged on logout
// too.
const CACHE_PREFIX = 'workout-day:v2:';
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

function computeDayStatus(exercises: Pick<Exercise, 'category' | 'performed'>[]): DayStatus {
	if (exercises.length === 0) return 'none';

	// Notes are scheduled content with nothing to grade — a day that is *only*
	// notes counts as 'exists', and a note never moves a mixed day's status.
	const gradable = exercises.filter(countsTowardCompletion);
	if (gradable.length === 0) return 'exists';

	const done = gradable.filter(exerciseComplete).length;

	if (done === gradable.length) return 'complete';
	if (done > 0) return 'in_progress';
	return 'exists';
}

/**
 * Derives a day's status from exercises already in hand (e.g. a day just
 * re-fetched after an edit), so a status-map dot can update without a
 * separate `getAthleteStatusMap` round trip.
 */
export function dayStatusFromExercises(
	exercises: Pick<Exercise, 'category' | 'performed'>[]
): DayStatus {
	return computeDayStatus(exercises);
}

function mapSetRow(row: Record<string, unknown>): SetEntry {
	return {
		id: row.id as string,
		setNumber: row.set_number as number,
		weight: row.weight != null ? String(row.weight) : null,
		reps: (row.reps as number) ?? null,
		done: !!row.done
	};
}

function mapExerciseRow(row: Record<string, unknown>): Exercise {
	const ex = row.exercises as {
		name: string;
		category: ExerciseCategory;
		video_url: string | null;
	};
	// Sorted once, up front, and both `plan` and `performed` are built off that
	// one ordered array — `plan` is read as plan[i] against performed[i]
	// everywhere, so deriving them from separate traversals would risk the two
	// disagreeing.
	const rows = ((row.athlete_sets as Record<string, unknown>[]) ?? []).sort(
		(a, b) => (a.set_number as number) - (b.set_number as number)
	);

	return {
		id: row.id as string,
		exerciseId: row.exercise_id as string,
		category: ex.category,
		activity: ex.name,
		videoUrl: ex.video_url ?? undefined,
		note: (row.note as string) ?? '',
		// Only weight prescribes a plan. A conditioning unit's target_reps is
		// null, and letting that through would render a circuit as "1 x 0".
		plan: ex.category === 'weight' ? rows.map((s) => (s.target_reps as number | null) ?? 0) : [],
		performed: rows.map(mapSetRow)
	};
}

export async function getWorkoutDay(athleteId: string, dateKey: string): Promise<Exercise[]> {
	// `fetchApi` throws on a non-2xx (and `fetch` already throws when offline)
	// rather than resolving `[]` — the callers can't tell an empty result apart
	// from a real rest day, so a swallowed failure would render "no workout" over
	// a transient blip. Throwing lets them show a "couldn't load" state and leave
	// any cached day standing.
	const workout = await fetchApi<Record<string, unknown> | null>('/api/workout', 'getDay', {
		athleteId,
		dateKey
	});
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

	const exercises = ordered.map(mapExerciseRow);

	cacheWorkoutDay(athleteId, dateKey, exercises);
	return exercises;
}

/**
 * Full exercise/set detail for every day in [from, to], keyed by
 * scheduled_date. Not cached here — loadMonth warms the same per-day
 * workout-day cache getWorkoutDay uses, which is enough.
 */
export async function getAthleteRangeExercises(
	athleteId: string,
	range: { from: string; to: string }
): Promise<Map<string, Exercise[]>> {
	const workouts = await fetchApi<Record<string, unknown>[]>('/api/workout', 'getRangeExercises', {
		athleteId,
		...range
	});

	// Plain Map: the function's return value is consumed once by loadMonth to
	// populate monthDays, never itself read reactively by a template.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const map = new Map<string, Exercise[]>();
	for (const workout of workouts) {
		const dateKey = workout.scheduled_date as string;
		const ordered = (workout.athlete_exercises as Record<string, unknown>[])?.sort(
			(a, b) => (a.position as number) - (b.position as number)
		);
		map.set(dateKey, ordered?.map(mapExerciseRow) ?? []);
	}
	return map;
}

export interface ExerciseHistorySet {
	setNumber: number;
	weight: string | null;
	reps: number | null;
	targetReps: number;
}

export interface ExerciseHistorySession {
	/** The athlete_exercises row id — a stable list key (the same lift can, in
	 *  principle, sit on a day twice). */
	id: string;
	dateKey: string;
	sets: ExerciseHistorySet[];
}

/**
 * Past sessions of one catalog exercise for one athlete, strictly before
 * `beforeDateKey`, most recent first. Not cached: it sits behind a deliberate
 * tap in the exercise modal, so a one-shot fetch with a spinner is fine, and
 * an in-memory cache here would need wiring into the logout purge. Sessions
 * with nothing logged (no set carrying a weight) are dropped — a scheduled
 * day the athlete skipped isn't "history" worth showing.
 */
export async function getExerciseHistory(
	athleteId: string,
	exerciseId: string,
	beforeDateKey: string
): Promise<ExerciseHistorySession[]> {
	const data = await fetchApi<Record<string, unknown>[] | null>('/api/workout', 'exerciseHistory', {
		athleteId,
		exerciseId,
		before: beforeDateKey
	});

	const sessions: ExerciseHistorySession[] = [];
	for (const workout of data ?? []) {
		const dateKey = workout.scheduled_date as string;
		for (const ae of (workout.athlete_exercises as Record<string, unknown>[]) ?? []) {
			const sets: ExerciseHistorySet[] = ((ae.athlete_sets as Record<string, unknown>[]) ?? [])
				.map((s) => ({
					setNumber: s.set_number as number,
					weight: s.weight != null ? String(s.weight) : null,
					reps: (s.reps as number) ?? null,
					targetReps: (s.target_reps as number) ?? 0
				}))
				.sort((a, b) => a.setNumber - b.setNumber);

			if (!sets.some((s) => s.weight)) continue;

			sessions.push({
				id: ae.id as string,
				dateKey,
				sets
			});
		}
	}

	return sessions;
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
	// A failed request is not an answer — leave any cached map standing rather
	// than caching an empty one over it (same reasoning as getWorkoutDay).
	// fetchApi already logged the failure with its status.
	let workouts: Record<string, unknown>[];
	try {
		workouts = await fetchApi<Record<string, unknown>[]>('/api/workout', 'getStatusMap', {
			athleteId,
			...range
		});
	} catch {
		return getCachedStatusMap(athleteId) ?? new SvelteMap();
	}
	// A ranged fetch only covers part of the athlete's history — start from
	// whatever's already cached and merge in, rather than replacing it
	// wholesale and losing dots for days outside this window.
	const map = range
		? (getCachedStatusMap(athleteId) ?? new SvelteMap<string, DayStatus>())
		: new SvelteMap<string, DayStatus>();

	// Plain Map: function-local scratch space used to build `map` (the actual
	// SvelteMap returned below) — never itself read reactively. Shaped to what
	// computeDayStatus/exerciseComplete need, which is why the status-map query
	// selects only `category` and the two per-set flags rather than the full
	// day: it reads every scheduled day in the range, so a narrow payload is
	// the point.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const grouped = new Map<string, Pick<Exercise, 'category' | 'performed'>[]>();

	for (const workout of workouts) {
		const date = workout.scheduled_date as string;
		const exercises = workout.athlete_exercises as {
			exercises: { category: ExerciseCategory };
			athlete_sets: { weight: string | null; done: boolean }[];
		}[];

		if (!exercises) continue;

		const list = grouped.get(date) ?? [];
		for (const exercise of exercises) {
			list.push({
				category: exercise.exercises.category,
				performed: exercise.athlete_sets.map((s, i) => ({
					setNumber: i + 1,
					weight: s.weight,
					reps: null,
					done: s.done
				}))
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
