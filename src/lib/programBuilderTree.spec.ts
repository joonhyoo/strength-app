import { describe, it, expect } from 'vitest';
import {
	locateWeek,
	locateSession,
	locateExercise,
	findWeek,
	findSession
} from '$lib/programBuilderTree';
import type { ProgramDetail } from '$lib/types';

const program: ProgramDetail = {
	id: 'program-1',
	name: 'Test Program',
	description: '',
	cycles: [
		{
			id: 'cycle-1',
			name: 'Cycle 1',
			goal: '',
			colorKey: 'sky',
			position: 0,
			weeks: [
				{
					id: 'week-1',
					weekNumber: 1,
					sessions: [
						{
							id: 'session-1',
							dayNumber: 1,
							name: 'Upper A',
							exercises: [
								{
									id: 'ex-1',
									activity: 'Bench Press',
									category: 'weight',
									note: '',
									plan: [5, 5, 5]
								}
							]
						}
					]
				}
			]
		},
		{
			id: 'cycle-2',
			name: 'Cycle 2',
			goal: '',
			colorKey: 'violet',
			position: 1,
			weeks: [
				{
					id: 'week-2',
					weekNumber: 1,
					sessions: [{ id: 'session-2', dayNumber: 2, name: 'Lower A', exercises: [] }]
				}
			]
		}
	]
};

describe('locateWeek', () => {
	it('finds a week in the first cycle', () => {
		const loc = locateWeek(program, 'week-1');
		expect(loc?.index).toBe(0);
		expect(loc?.weeks).toBe(program.cycles[0].weeks);
	});

	it('finds a week nested in a later cycle', () => {
		const loc = locateWeek(program, 'week-2');
		expect(loc?.index).toBe(0);
		expect(loc?.weeks).toBe(program.cycles[1].weeks);
	});

	it('returns null for an unknown id', () => {
		expect(locateWeek(program, 'missing')).toBeNull();
	});

	it('returns null for a null program', () => {
		expect(locateWeek(null, 'week-1')).toBeNull();
	});
});

describe('locateSession', () => {
	it('finds a session across cycles', () => {
		const loc = locateSession(program, 'session-2');
		expect(loc?.index).toBe(0);
		expect(loc?.sessions).toBe(program.cycles[1].weeks[0].sessions);
	});

	it('returns null for an unknown id', () => {
		expect(locateSession(program, 'missing')).toBeNull();
	});
});

describe('locateExercise', () => {
	it('finds an exercise and reports its owning session id', () => {
		const loc = locateExercise(program, 'ex-1');
		expect(loc?.index).toBe(0);
		expect(loc?.sessionId).toBe('session-1');
		expect(loc?.exercises).toBe(program.cycles[0].weeks[0].sessions[0].exercises);
	});

	it('returns null for an unknown id', () => {
		expect(locateExercise(program, 'missing')).toBeNull();
	});
});

describe('findWeek', () => {
	it('returns the week object directly', () => {
		expect(findWeek(program, 'week-2')).toBe(program.cycles[1].weeks[0]);
	});

	it('returns null for an unknown id', () => {
		expect(findWeek(program, 'missing')).toBeNull();
	});
});

describe('findSession', () => {
	it('returns the session plus its owning week id', () => {
		const found = findSession(program, 'session-2');
		expect(found?.session).toBe(program.cycles[1].weeks[0].sessions[0]);
		expect(found?.weekId).toBe('week-2');
	});

	it('returns null for an unknown id', () => {
		expect(findSession(program, 'missing')).toBeNull();
	});
});
