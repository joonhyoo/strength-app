import type { AssignmentDate as AssignmentDateType } from '$lib/types';
import { addDays } from '$lib/dateKey';
import type { FlatProgram } from './programTree';

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
