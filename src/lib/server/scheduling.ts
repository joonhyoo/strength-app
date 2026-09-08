import type { SupabaseClient } from '@supabase/supabase-js';
import type { Breadcrumb } from '$lib/types';
import { addDays } from '$lib/dateKey';
import { dbList, dbMaybe } from './db';
import { serverLog, type Logger } from './log';
import { loadProgramTree, flattenProgram } from './programTree';
import { computeAssignmentDates, type AssignmentDate } from './programDates';

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
