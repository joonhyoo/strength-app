import { describe, it, expect } from 'vitest';
import {
	parseKey,
	formatDayMonth,
	addDays,
	toKey,
	mondayOf,
	diffDays,
	monthGridKeys
} from '$lib/dateKey';

describe('parseKey', () => {
	it('parses a YYYY-MM-DD key to local midnight on that date', () => {
		expect(parseKey('2026-03-05')).toEqual(new Date(2026, 2, 5));
	});
});

describe('addDays', () => {
	it('shifts forward across a month boundary', () => {
		expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
	});

	it('shifts backward when n is negative', () => {
		expect(addDays('2026-03-02', -3)).toBe('2026-02-27');
	});

	it('shifts forward across a month boundary on a leap year', () => {
		expect(addDays('2028-02-25', 5)).toBe('2028-03-01');
	});
});

describe('toKey', () => {
	it('parses a date to YYYY-MM-DD format', () => {
		expect(toKey(new Date(2026, 5, 7))).toBe('2026-06-07');
	});
});

describe('mondayOf', () => {
	it('returns the Monday of the current week', () => {
		expect(mondayOf('2026-11-12')).toBe('2026-11-09');
	});

	it('returns the same date when given a Monday', () => {
		expect(mondayOf('2026-09-07')).toBe('2026-09-07');
	});
});

describe('diffDays', () => {
	it('is positive when b is after a', () => {
		expect(diffDays('2024-07-11', '2024-07-14')).toBe(3);
	});

	it('is negative when b is before a', () => {
		expect(diffDays('2024-07-21', '2024-07-19')).toBe(-2);
	});
});

describe('formatDayMonth', () => {
	it('formats a YYYY-MM-DD key into numeric short month', () => {
		expect(formatDayMonth('1996-12-10')).toBe('10 Dec');
	});
});

describe('monthGridKeys', () => {
	it('pads a month that starts mid-week to full leading/trailing weeks', () => {
		const keys = monthGridKeys(new Date(2026, 8, 1)); // September 2026 starts on a Tuesday
		expect(keys[0]).toBe('2026-08-31');
		expect(keys[keys.length - 1]).toBe('2026-10-04');
		expect(keys.length % 7).toBe(0);
	});

	it('still pads a month that starts on a Monday', () => {
		const keys = monthGridKeys(new Date(2026, 5, 1)); // June 2026 starts on a Monday
		expect(keys[0]).toBe('2026-06-01');
		expect(keys[keys.length - 1]).toBe('2026-07-05');
		expect(keys.length % 7).toBe(0);
	});
});
