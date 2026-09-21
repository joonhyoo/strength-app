import type { ProgramDetail, WeekDetail, SessionDetail, ProgramExerciseDetail } from '$lib/types';

export function locateExercise(
	program: ProgramDetail | null,
	programExerciseId: string
): { exercises: ProgramExerciseDetail[]; index: number; sessionId: string } | null {
	for (const cycle of program?.cycles ?? []) {
		for (const week of cycle.weeks) {
			for (const session of week.sessions) {
				const index = session.exercises.findIndex((e) => e.id === programExerciseId);
				if (index !== -1) return { exercises: session.exercises, index, sessionId: session.id };
			}
		}
	}
	return null;
}

export function findWeek(program: ProgramDetail | null, weekId: string): WeekDetail | null {
	for (const cycle of program?.cycles ?? []) {
		const week = cycle.weeks.find((w) => w.id === weekId);
		if (week) return week;
	}
	return null;
}

export function findSession(
	program: ProgramDetail | null,
	sessionId: string
): { session: SessionDetail; weekId: string } | null {
	for (const cycle of program?.cycles ?? []) {
		for (const week of cycle.weeks) {
			const session = week.sessions.find((s) => s.id === sessionId);
			if (session) return { session, weekId: week.id };
		}
	}
	return null;
}
