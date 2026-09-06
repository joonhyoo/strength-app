import type {
	ExerciseCategory,
	ColorKey,
	ProgramDetail,
	Breadcrumb,
	AssignmentDate
} from '$lib/types';
import { postApi } from './api';

export type { ColorKey, ProgramDetail, Breadcrumb, AssignmentDate };

export interface ProgramSummary {
	id: string;
	name: string;
	description: string;
	cycleCount: number;
	weekCount: number;
}

export interface ProgramExerciseInput {
	activity: string;
	category: ExerciseCategory;
	note: string;
	plan: number[];
}

/** Every `/api/program` call, normalised to `{ ok, data | error }` — see `postApi`. */
const postProgram = (action: string, data: Record<string, unknown>) =>
	postApi('/api/program', action, data);

export async function listPrograms() {
	const res = await postProgram('listPrograms', {});
	return res.ok ? (res.data as ProgramSummary[]) : [];
}

export async function getProgram(programId: string) {
	const res = await postProgram('getProgram', { programId });
	return res.ok ? (res.data as ProgramDetail) : null;
}

export async function createProgram(name: string, description: string) {
	return postProgram('createProgram', { name, description });
}

export async function updateProgram(programId: string, name: string, description: string) {
	return postProgram('updateProgram', { programId, name, description });
}

export async function deleteProgram(programId: string) {
	return postProgram('deleteProgram', { programId });
}

export async function addCycle(programId: string, name: string, goal: string, colorKey: ColorKey) {
	return postProgram('addCycle', { programId, name, goal, colorKey });
}

export async function updateCycle(cycleId: string, name: string, goal: string, colorKey: ColorKey) {
	return postProgram('updateCycle', { cycleId, name, goal, colorKey });
}

export async function removeCycle(cycleId: string) {
	return postProgram('removeCycle', { cycleId });
}

export async function addWeek(cycleId: string) {
	return postProgram('addWeek', { cycleId });
}

export async function duplicateWeek(sourceWeekId: string) {
	return postProgram('duplicateWeek', { sourceWeekId });
}

export async function removeWeek(weekId: string) {
	return postProgram('removeWeek', { weekId });
}

export async function addSession(weekId: string, dayNumber: number, name: string) {
	return postProgram('addSession', { weekId, dayNumber, name });
}

export async function duplicateSession(
	sourceSessionId: string,
	destWeekId: string,
	destDayNumber: number,
	replace: boolean
) {
	return postProgram('duplicateSession', { sourceSessionId, destWeekId, destDayNumber, replace });
}

export async function updateSession(sessionId: string, name: string) {
	return postProgram('updateSession', { sessionId, name });
}

export async function removeSession(sessionId: string) {
	return postProgram('removeSession', { sessionId });
}

export async function addProgramExercise(sessionId: string, exercise: ProgramExerciseInput) {
	return postProgram('addProgramExercise', { sessionId, exercise });
}

export async function updateProgramExercise(
	programExerciseId: string,
	exercise: ProgramExerciseInput
) {
	return postProgram('updateProgramExercise', { programExerciseId, exercise });
}

export async function removeProgramExercise(programExerciseId: string) {
	return postProgram('removeProgramExercise', { programExerciseId });
}

export async function reorderProgramExercise(programExerciseId: string, toIndex: number) {
	return postProgram('reorderProgramExercise', { programExerciseId, toIndex });
}

export async function checkAssignConflicts(
	programId: string,
	athleteId: string,
	startDate: string
) {
	const res = await postProgram('checkAssignConflicts', { programId, athleteId, startDate });
	return res.ok ? (res.data as { dates: AssignmentDate[]; conflicts: string[] }) : null;
}

export async function assignProgram(programId: string, athleteId: string, startDate: string) {
	return postProgram('assignProgram', { programId, athleteId, startDate });
}

export async function checkShiftConflicts(athleteId: string, fromDate: string, shiftWeeks: number) {
	const res = await postProgram('checkShiftConflicts', { athleteId, fromDate, shiftWeeks });
	return res.ok ? (res.data as { moving: string[]; conflicts: string[] }) : null;
}

export async function shiftSchedule(athleteId: string, fromDate: string, shiftWeeks: number) {
	return postProgram('shiftSchedule', { athleteId, fromDate, shiftWeeks });
}

/** Resolves a day's Program › Cycle › Week crumb — purely from the day's own
 * session link (no date-math fallback), so a cleared week, and any exercises
 * later added to it, stay breadcrumb-free. Shared by the coach Training page
 * and the athlete Train page. */
export async function getBreadcrumb(athleteId: string, dateKey: string) {
	const res = await postProgram('getBreadcrumb', { athleteId, dateKey });
	return res.ok ? (res.data as Breadcrumb | null) : null;
}
