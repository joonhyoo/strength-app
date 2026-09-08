import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ColorKey,
	ProgramTree,
	ProgramDetail,
	ProgramExerciseDetail,
	WeekDetail,
	SessionDetail,
	ExerciseCategory
} from '$lib/types';
import { dbMaybe } from './db';
import { serverLog, type Logger } from './log';

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
 * single source of truth every date computation and breadcrumb lookup builds
 * on — cycles.position/weeks.week_number are rank-only (see the migration),
 * so nothing may key off those raw stored integers directly.
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
