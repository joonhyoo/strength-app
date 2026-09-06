import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ColorKey,
	ProgramTree,
	ProgramDetail,
	ProgramExerciseDetail,
	WeekDetail,
	SessionDetail,
	ExerciseCategory,
	AssignmentDate as AssignmentDateType,
	Breadcrumb
} from '$lib/types';
import { dbList, dbMaybe } from './db';
import { serverLog, type Logger } from './log';

export type { ColorKey, ProgramTree, ProgramDetail, WeekDetail, SessionDetail, Breadcrumb };

/** Loads a program's full tree, ordered by each level's rank (position/week_number). */
export async function loadProgramTree(
	supabase: SupabaseClient,
	programId: string,
	log: Logger = serverLog
): Promise<ProgramTree | null> {
	const data = await dbMaybe(
		log,
		'program.loadTree',
		supabase
			.from('programs')
			.select(
				`id, name, description,
				 cycles(id, name, goal, color_key, position,
				   weeks(id, week_number,
				     sessions(id, day_number, name)
				   )
				 )`
			)
			.eq('id', programId)
			.maybeSingle()
	);

	if (!data) return null;

	type CycleRow = (typeof data.cycles)[number];
	type WeekRow = CycleRow['weeks'][number];
	type SessionRow = WeekRow['sessions'][number];

	return {
		id: data.id,
		name: data.name,
		description: data.description,
		cycles: (data.cycles ?? [])
			.slice()
			.sort((a: CycleRow, b: CycleRow) => a.position - b.position)
			.map((c: CycleRow) => ({
				id: c.id,
				name: c.name,
				goal: c.goal,
				colorKey: c.color_key as ColorKey,
				position: c.position,
				weeks: (c.weeks ?? [])
					.slice()
					.sort((a: WeekRow, b: WeekRow) => a.week_number - b.week_number)
					.map((w: WeekRow) => ({
						id: w.id,
						weekNumber: w.week_number,
						sessions: (w.sessions ?? [])
							.slice()
							.sort((a: SessionRow, b: SessionRow) => a.day_number - b.day_number)
							.map((s: SessionRow) => ({ id: s.id, dayNumber: s.day_number, name: s.name }))
					}))
			}))
	};
}

// Shared PostgREST select + row→view-model mapping for a program's exercise-level
// detail. loadProgramDetail (whole tree) and loadWeekDetail / loadSessionDetail
// (one node, for reconciling an optimistic copy) all go through these so the
// shapes and per-level ordering can't drift apart.

const SESSION_DETAIL_SELECT = `id, day_number, name,
	program_exercises(id, position, note,
		exercises(name, category),
		program_sets(set_number, target_reps)
	)`;

const WEEK_DETAIL_SELECT = `id, week_number,
	sessions(${SESSION_DETAIL_SELECT})`;

interface RawSetRow {
	set_number: number;
	target_reps: number;
}

interface RawProgramExerciseRow {
	id: string;
	position: number;
	note: string;
	exercises: { name: string; category: string } | null;
	program_sets: RawSetRow[] | null;
}

interface RawSessionRow {
	id: string;
	day_number: number;
	name: string;
	program_exercises: RawProgramExerciseRow[] | null;
}

interface RawWeekRow {
	id: string;
	week_number: number;
	sessions: RawSessionRow[] | null;
}

function mapExercise(pe: RawProgramExerciseRow): ProgramExerciseDetail {
	return {
		id: pe.id,
		activity: pe.exercises!.name,
		category: pe.exercises!.category as ExerciseCategory,
		note: pe.note,
		plan: (pe.program_sets ?? [])
			.slice()
			.sort((a, b) => a.set_number - b.set_number)
			.map((s) => s.target_reps)
	};
}

function mapSessionRow(s: RawSessionRow): SessionDetail {
	return {
		id: s.id,
		dayNumber: s.day_number,
		name: s.name,
		exercises: (s.program_exercises ?? [])
			.slice()
			.sort((a, b) => a.position - b.position)
			.map(mapExercise)
	};
}

function mapWeekRow(w: RawWeekRow): WeekDetail {
	return {
		id: w.id,
		weekNumber: w.week_number,
		sessions: (w.sessions ?? [])
			.slice()
			.sort((a, b) => a.day_number - b.day_number)
			.map(mapSessionRow)
	};
}

/** Full tree including exercises/sets — see ProgramDetail's own doc comment for why this is separate from loadProgramTree. */
export async function loadProgramDetail(
	supabase: SupabaseClient,
	programId: string,
	log: Logger = serverLog
): Promise<ProgramDetail | null> {
	const data = await dbMaybe(
		log,
		'program.loadDetail',
		supabase
			.from('programs')
			.select(
				`id, name, description,
			 cycles(id, name, goal, color_key, position,
			   weeks(${WEEK_DETAIL_SELECT})
			 )`
			)
			.eq('id', programId)
			.maybeSingle()
	);

	if (!data) return null;

	type CycleRow = (typeof data.cycles)[number];

	return {
		id: data.id,
		name: data.name,
		description: data.description,
		cycles: (data.cycles ?? [])
			.slice()
			.sort((a: CycleRow, b: CycleRow) => a.position - b.position)
			.map((c: CycleRow) => ({
				id: c.id,
				name: c.name,
				goal: c.goal,
				colorKey: c.color_key as ColorKey,
				position: c.position,
				weeks: ((c.weeks ?? []) as RawWeekRow[])
					.slice()
					.sort((a, b) => a.week_number - b.week_number)
					.map(mapWeekRow)
			}))
	};
}

/** One week's full subtree (sessions → exercises → sets), ordered per level like
 *  loadProgramDetail. Used to reconcile an optimistically-inserted copied week. */
export async function loadWeekDetail(
	supabase: SupabaseClient,
	weekId: string,
	log: Logger = serverLog
): Promise<WeekDetail | null> {
	const data = await dbMaybe(
		log,
		'program.loadWeekDetail',
		supabase.from('weeks').select(WEEK_DETAIL_SELECT).eq('id', weekId).maybeSingle()
	);

	return data ? mapWeekRow(data as unknown as RawWeekRow) : null;
}

/** One session's full subtree (exercises → sets), ordered per level like
 *  loadProgramDetail. Used to reconcile an optimistically-pasted session. */
export async function loadSessionDetail(
	supabase: SupabaseClient,
	sessionId: string,
	log: Logger = serverLog
): Promise<SessionDetail | null> {
	const data = await dbMaybe(
		log,
		'program.loadSessionDetail',
		supabase.from('sessions').select(SESSION_DETAIL_SELECT).eq('id', sessionId).maybeSingle()
	);

	return data ? mapSessionRow(data as unknown as RawSessionRow) : null;
}

export interface FlatWeek {
	weekId: string;
	cycleId: string;
	cycleName: string;
	colorKey: ColorKey;
	/** 0-based rank across the WHOLE program, not just within its cycle. */
	weekRank: number;
	sessionsByDay: Map<number, { id: string; name: string }>;
}

export interface FlatProgram {
	programId: string;
	programName: string;
	totalWeeks: number;
	/** Ordered by weekRank. */
	weeks: FlatWeek[];
}

/**
 * Flattens cycles→weeks into one program-wide, rank-ordered list. This is the
 * single source of truth every date computation and breadcrumb lookup below
 * builds on — cycles.position/weeks.week_number are rank-only (see the
 * migration), so nothing may key off those raw stored integers directly.
 */
export function flattenProgram(tree: ProgramTree): FlatProgram {
	const weeks: FlatWeek[] = [];
	let rank = 0;
	for (const cycle of tree.cycles) {
		for (const week of cycle.weeks) {
			const sessionsByDay = new Map<number, { id: string; name: string }>();
			for (const s of week.sessions) sessionsByDay.set(s.dayNumber, { id: s.id, name: s.name });
			weeks.push({
				weekId: week.id,
				cycleId: cycle.id,
				cycleName: cycle.name,
				colorKey: cycle.colorKey,
				weekRank: rank++,
				sessionsByDay
			});
		}
	}
	return { programId: tree.id, programName: tree.name, totalWeeks: weeks.length, weeks };
}

// ---------------------------------------------------------------------------
// Date-key helpers. Dates are plain 'YYYY-MM-DD' strings throughout (matching
// the rest of the app's `toLocaleDateString('fr-CA')` convention), computed
// via local-time Date arithmetic — never string/interval math — so DST
// transitions can't shift a date by a day.
// ---------------------------------------------------------------------------

function fromKey(key: string): Date {
	const [y, m, d] = key.split('-').map(Number);
	return new Date(y, m - 1, d);
}

function toKey(date: Date): string {
	return date.toLocaleDateString('fr-CA');
}

export function addDays(key: string, n: number): string {
	const d = fromKey(key);
	d.setDate(d.getDate() + n);
	return toKey(d);
}

export function isMonday(key: string): boolean {
	return fromKey(key).getDay() === 1;
}

/** Whole-day difference (b - a). Both operands are local midnight, so this is DST-safe. */
export function diffDays(a: string, b: string): number {
	return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000);
}

export type AssignmentDate = AssignmentDateType;

/** Mirrors assign_program's own date math exactly — see the migration. */
export function computeAssignmentDates(flat: FlatProgram, startDate: string): AssignmentDate[] {
	const out: AssignmentDate[] = [];
	for (const week of flat.weeks) {
		for (const [dayNumber, session] of week.sessionsByDay) {
			out.push({
				dateKey: addDays(startDate, week.weekRank * 7 + (dayNumber - 1)),
				sessionId: session.id,
				sessionName: session.name,
				weekRank: week.weekRank
			});
		}
	}
	return out.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
}

/** Preview only — never mutates. The real assign runs via the assign_program RPC. */
export async function checkAssignConflicts(
	supabase: SupabaseClient,
	programId: string,
	athleteId: string,
	startDate: string,
	log: Logger = serverLog
): Promise<{ dates: AssignmentDate[]; conflicts: string[] }> {
	const tree = await loadProgramTree(supabase, programId, log);
	if (!tree) return { dates: [], conflicts: [] };

	const dates = computeAssignmentDates(flattenProgram(tree), startDate);
	if (dates.length === 0) return { dates, conflicts: [] };

	const existing = await dbList(
		log,
		'assign.conflictCheck',
		supabase
			.from('athlete_workouts')
			.select('scheduled_date')
			.eq('athlete_id', athleteId)
			.in(
				'scheduled_date',
				dates.map((d) => d.dateKey)
			)
	);

	const existingSet = new Set(existing.map((r) => r.scheduled_date as string));
	const conflicts = dates.filter((d) => existingSet.has(d.dateKey)).map((d) => d.dateKey);
	return { dates, conflicts };
}

/**
 * Preview only. Scoped by athlete + date, not a program_assignment_id — a
 * hand-written schedule (never run through Assign Program) has no assignment
 * to key off, so this moves whatever's actually scheduled from fromDate
 * onward regardless of how it got there. Mirrors shift_program_schedule's own
 * athlete-scoped query exactly, so this preview can never disagree with what
 * the real shift then does.
 *
 * A destination date only counts as a real conflict if it's occupied by a
 * row OUTSIDE the moving set — a moving row can legitimately currently sit at
 * another moving row's destination (e.g. shifting by exactly one week),
 * which the real shift_program_schedule RPC resolves safely via a
 * temp-offset move. `movingSet` is what excludes those false positives here.
 */
export async function checkShiftConflicts(
	supabase: SupabaseClient,
	athleteId: string,
	fromDate: string,
	shiftWeeks: number,
	log: Logger = serverLog
): Promise<{ moving: string[]; conflicts: string[] }> {
	const moving = await dbList(
		log,
		'shift.movingSet',
		supabase
			.from('athlete_workouts')
			.select('scheduled_date')
			.eq('athlete_id', athleteId)
			.gte('scheduled_date', fromDate)
	);

	const movingDates = moving.map((r) => r.scheduled_date as string);
	if (movingDates.length === 0) return { moving: movingDates, conflicts: [] };

	const shiftDays = shiftWeeks * 7;
	const destDates = movingDates.map((d) => addDays(d, shiftDays));
	const movingSet = new Set(movingDates);

	const existing = await dbList(
		log,
		'shift.conflictCheck',
		supabase
			.from('athlete_workouts')
			.select('scheduled_date')
			.eq('athlete_id', athleteId)
			.in('scheduled_date', destDates)
	);

	const existingSet = new Set(existing.map((r) => r.scheduled_date as string));
	const conflicts = destDates.filter((d) => existingSet.has(d) && !movingSet.has(d));
	return { moving: movingDates, conflicts };
}

/**
 * Resolves "what program/cycle/week is this day" from the day's OWN stored
 * `session_id` link — never recomputed from a date. The link travels with the
 * row, so a shifted or copied day keeps reading correctly wherever it lands on
 * the calendar.
 *
 * There is deliberately no date-math fallback: a day with no `session_id`
 * (a rest day, an ad-hoc day, a day in a cleared week) has no program context
 * to show. Guessing one from an assignment's on-paper range was how a cleared
 * week kept showing "Week 3 of 8" — see testing-notes 2026-09-06.
 */
async function resolveSessionBreadcrumb(
	supabase: SupabaseClient,
	sessionId: string,
	log: Logger
): Promise<Breadcrumb | null> {
	const rawSession = await dbMaybe(
		log,
		'breadcrumb.session',
		supabase
			.from('sessions')
			.select('id, name, weeks(id, cycles(program_id))')
			.eq('id', sessionId)
			.maybeSingle()
	);

	// A forward FK embed (sessions -> weeks -> cycles) is a single row at
	// runtime, same as getWorkoutDay's `row.exercises` — the generated type
	// is imprecise about this for a nesting this deep, so cast explicitly
	// rather than fight it, matching that existing convention.
	const session = rawSession as {
		id: string;
		name: string;
		weeks: { id: string; cycles: { program_id: string } } | null;
	} | null;

	const programId = session?.weeks?.cycles?.program_id;
	if (!session || !session.weeks || !programId) return null; // orphaned: the template session was since deleted

	const tree = await loadProgramTree(supabase, programId, log);
	if (!tree) return null;

	const flat = flattenProgram(tree);
	const week = flat.weeks.find((w) => w.weekId === session.weeks!.id);
	if (!week) return null;

	return {
		programName: flat.programName,
		cycleName: week.cycleName,
		colorKey: week.colorKey,
		weekOfTotal: week.weekRank + 1,
		totalWeeks: flat.totalWeeks,
		label: session.name
	};
}

/**
 * "What program/cycle/week is this athlete's day" — for the breadcrumb on both
 * the coach Training page and the athlete Train page. Resolves purely from the
 * day's own session link (see resolveSessionBreadcrumb); `null` when the day
 * carries none.
 */
export async function resolveBreadcrumb(
	supabase: SupabaseClient,
	athleteId: string,
	dateKey: string,
	log: Logger = serverLog
): Promise<Breadcrumb | null> {
	const workout = await dbMaybe(
		log,
		'breadcrumb.workout',
		supabase
			.from('athlete_workouts')
			.select('session_id')
			.eq('athlete_id', athleteId)
			.eq('scheduled_date', dateKey)
			.maybeSingle()
	);

	if (!workout?.session_id) return null;
	return resolveSessionBreadcrumb(supabase, workout.session_id, log);
}
