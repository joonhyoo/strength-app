import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ColorKey,
	ProgramTree,
	ProgramDetail,
	ExerciseCategory,
	AssignmentDate as AssignmentDateType,
	Breadcrumb
} from '$lib/types';

export type { ColorKey, ProgramTree, ProgramDetail, Breadcrumb };

/** Loads a program's full tree, ordered by each level's rank (position/week_number). */
export async function loadProgramTree(
	supabase: SupabaseClient,
	programId: string
): Promise<ProgramTree | null> {
	const { data } = await supabase
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
		.maybeSingle();

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

/** Full tree including exercises/sets — see ProgramDetail's own doc comment for why this is separate from loadProgramTree. */
export async function loadProgramDetail(
	supabase: SupabaseClient,
	programId: string
): Promise<ProgramDetail | null> {
	const { data } = await supabase
		.from('programs')
		.select(
			`id, name, description,
			 cycles(id, name, goal, color_key, position,
			   weeks(id, week_number,
			     sessions(id, day_number, name,
			       program_exercises(id, position, note,
			         exercises(name, category),
			         program_sets(set_number, target_reps)
			       )
			     )
			   )
			 )`
		)
		.eq('id', programId)
		.maybeSingle();

	if (!data) return null;

	type CycleRow = (typeof data.cycles)[number];
	type WeekRow = CycleRow['weeks'][number];
	type SessionRow = WeekRow['sessions'][number];
	type ProgramExerciseRow = SessionRow['program_exercises'][number];
	type ProgramSetRow = ProgramExerciseRow['program_sets'][number];

	const mapExercise = (pe: ProgramExerciseRow) => ({
		id: pe.id,
		activity: pe.exercises!.name,
		category: pe.exercises!.category as ExerciseCategory,
		note: pe.note,
		plan: (pe.program_sets ?? [])
			.slice()
			.sort((a: ProgramSetRow, b: ProgramSetRow) => a.set_number - b.set_number)
			.map((s: ProgramSetRow) => s.target_reps)
	});

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
							.map((s: SessionRow) => ({
								id: s.id,
								dayNumber: s.day_number,
								name: s.name,
								exercises: (s.program_exercises ?? [])
									.slice()
									.sort((a: ProgramExerciseRow, b: ProgramExerciseRow) => a.position - b.position)
									.map(mapExercise)
							}))
					}))
			}))
	};
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
	startDate: string
): Promise<{ dates: AssignmentDate[]; conflicts: string[] }> {
	const tree = await loadProgramTree(supabase, programId);
	if (!tree) return { dates: [], conflicts: [] };

	const dates = computeAssignmentDates(flattenProgram(tree), startDate);
	if (dates.length === 0) return { dates, conflicts: [] };

	const { data: existing } = await supabase
		.from('athlete_workouts')
		.select('scheduled_date')
		.eq('athlete_id', athleteId)
		.in(
			'scheduled_date',
			dates.map((d) => d.dateKey)
		);

	const existingSet = new Set((existing ?? []).map((r) => r.scheduled_date as string));
	const conflicts = dates.filter((d) => existingSet.has(d.dateKey)).map((d) => d.dateKey);
	return { dates, conflicts };
}

/**
 * Preview only. A destination date only counts as a real conflict if it's
 * occupied by a row OUTSIDE the moving set — a moving row can legitimately
 * currently sit at another moving row's destination (e.g. shifting by
 * exactly one week), which the real shift_program_schedule RPC resolves
 * safely via a temp-offset move. `movingSet` is what excludes those
 * false positives here.
 */
export async function checkShiftConflicts(
	supabase: SupabaseClient,
	assignmentId: string,
	athleteId: string,
	fromDate: string,
	shiftWeeks: number
): Promise<{ moving: string[]; conflicts: string[] }> {
	const { data: moving } = await supabase
		.from('athlete_workouts')
		.select('scheduled_date')
		.eq('program_assignment_id', assignmentId)
		.gte('scheduled_date', fromDate);

	const movingDates = (moving ?? []).map((r) => r.scheduled_date as string);
	if (movingDates.length === 0) return { moving: movingDates, conflicts: [] };

	const shiftDays = shiftWeeks * 7;
	const destDates = movingDates.map((d) => addDays(d, shiftDays));
	const movingSet = new Set(movingDates);

	const { data: existing } = await supabase
		.from('athlete_workouts')
		.select('scheduled_date')
		.eq('athlete_id', athleteId)
		.in('scheduled_date', destDates);

	const existingSet = new Set((existing ?? []).map((r) => r.scheduled_date as string));
	const conflicts = destDates.filter((d) => existingSet.has(d) && !movingSet.has(d));
	return { moving: movingDates, conflicts };
}

/**
 * Resolves "what program/cycle/week is this day" for one specific scheduled
 * day, from its OWN stored `session_id` link — never recomputed from the
 * date. This is what makes a shifted or copied day keep reading correctly no
 * matter where it lands on the calendar: the link travels with the row, not
 * with an assignment's start_date.
 */
async function resolveSessionBreadcrumb(
	supabase: SupabaseClient,
	sessionId: string
): Promise<Breadcrumb | null> {
	const { data: rawSession } = await supabase
		.from('sessions')
		.select('id, name, weeks(id, cycles(program_id))')
		.eq('id', sessionId)
		.maybeSingle();

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

	const tree = await loadProgramTree(supabase, programId);
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
		label: session.name,
		isComplete: false
	};
}

/**
 * Fallback for a day with no direct session link (a rest day, an ad-hoc day,
 * or nothing scheduled at all): resolves from whichever program assignment's
 * on-paper range covers — or has passed — dateKey. Scans every assignment
 * the athlete has ever had (not just the current active one) because a
 * coach can reassign a new program after a prior one completes, and a date
 * being viewed might fall under an earlier one. Returns null only when
 * dateKey is outside every assignment's range on both ends (before the
 * first ever started) or the athlete has none at all.
 */
async function resolveAssignmentBreadcrumb(
	supabase: SupabaseClient,
	athleteId: string,
	dateKey: string
): Promise<Breadcrumb | null> {
	const { data: assignments } = await supabase
		.from('program_assignments')
		.select('id, program_id, start_date')
		.eq('athlete_id', athleteId)
		.order('start_date', { ascending: false });

	if (!assignments || assignments.length === 0) return null;

	const candidates: { startDate: string; flat: FlatProgram; endDate: string }[] = [];
	for (const a of assignments) {
		const tree = await loadProgramTree(supabase, a.program_id);
		if (!tree) continue;
		const flat = flattenProgram(tree);
		if (flat.totalWeeks === 0) continue;
		candidates.push({
			startDate: a.start_date,
			flat,
			endDate: addDays(a.start_date, flat.totalWeeks * 7 - 1)
		});
	}
	if (candidates.length === 0) return null;

	// `candidates` is in start_date-desc order (newest first). A coach can
	// reassign a new program before an older one's on-paper range would have
	// naturally ended — once that happens the older one is superseded, not
	// still "covering" those later dates just because its own template was
	// long enough to reach them. Clip each candidate's effective end to just
	// before the next-newer one's start, so ranges never overlap and the
	// newest assignment always wins on any date it actually reaches.
	for (let i = 1; i < candidates.length; i++) {
		const newerStart = candidates[i - 1].startDate;
		if (newerStart <= candidates[i].endDate) candidates[i].endDate = addDays(newerStart, -1);
	}

	const covering = candidates.find((c) => dateKey >= c.startDate && dateKey <= c.endDate);
	const latest = candidates.reduce((a, b) => (b.endDate > a.endDate ? b : a));
	const chosen = covering ?? latest;
	const isComplete = !covering && dateKey > chosen.endDate;

	if (!covering && !isComplete) return null; // dateKey predates every assignment

	if (isComplete) {
		const week = chosen.flat.weeks[chosen.flat.weeks.length - 1];
		return {
			programName: chosen.flat.programName,
			cycleName: week.cycleName,
			colorKey: week.colorKey,
			weekOfTotal: week.weekRank + 1,
			totalWeeks: chosen.flat.totalWeeks,
			label: 'Program complete',
			isComplete: true
		};
	}

	const offset = diffDays(chosen.startDate, dateKey);
	const week = chosen.flat.weeks[Math.floor(offset / 7)];
	if (!week) return null;
	const session = week.sessionsByDay.get((offset % 7) + 1);

	return {
		programName: chosen.flat.programName,
		cycleName: week.cycleName,
		colorKey: week.colorKey,
		weekOfTotal: week.weekRank + 1,
		totalWeeks: chosen.flat.totalWeeks,
		label: session ? session.name : 'Rest day',
		isComplete: false
	};
}

/**
 * Resolves "what program/cycle/week is this athlete in, as of dateKey" —
 * feeds the breadcrumb, the athlete roster tag, and the Library pin. Tries
 * the day's own direct link first (correct for a scheduled session, and for
 * a session copied/pasted onto an athlete who was never formally assigned
 * anything), then falls back to assignment-based date math for a rest day
 * or a day with nothing scheduled at all.
 */
export async function resolveBreadcrumb(
	supabase: SupabaseClient,
	athleteId: string,
	dateKey: string
): Promise<Breadcrumb | null> {
	const { data: workout } = await supabase
		.from('athlete_workouts')
		.select('session_id')
		.eq('athlete_id', athleteId)
		.eq('scheduled_date', dateKey)
		.maybeSingle();

	if (workout?.session_id) {
		const direct = await resolveSessionBreadcrumb(supabase, workout.session_id);
		if (direct) return direct;
	}

	return resolveAssignmentBreadcrumb(supabase, athleteId, dateKey);
}
