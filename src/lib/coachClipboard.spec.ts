import { describe, it, expect } from 'vitest';
import { dayClipboardMode, weekClipboardMode, type Clipboard } from '$lib/coachClipboard';

describe('dayClipboardMode', () => {
	it("is 'copy' when nothing is on the clipboard", () => {
		expect(dayClipboardMode(null, 'athlete-1', '2026-09-08')).toBe('copy');
	});

	it("is 'copy' for every day while a week is on the clipboard", () => {
		const clipboard: Clipboard = {
			type: 'week',
			athleteId: 'athlete-1',
			athleteName: 'A',
			weekStart: '2026-09-07'
		};
		expect(dayClipboardMode(clipboard, 'athlete-1', '2026-09-08')).toBe('copy');
	});

	it("is 'cancel' on the exact day that's copied", () => {
		const clipboard: Clipboard = {
			type: 'day',
			athleteId: 'athlete-1',
			athleteName: 'A',
			dateKey: '2026-09-08'
		};
		expect(dayClipboardMode(clipboard, 'athlete-1', '2026-09-08')).toBe('cancel');
	});

	it("is 'paste' on a different day for the same athlete", () => {
		const clipboard: Clipboard = {
			type: 'day',
			athleteId: 'athlete-1',
			athleteName: 'A',
			dateKey: '2026-09-08'
		};
		expect(dayClipboardMode(clipboard, 'athlete-1', '2026-09-09')).toBe('paste');
	});

	it("is 'paste' on the same day for a different athlete", () => {
		const clipboard: Clipboard = {
			type: 'day',
			athleteId: 'athlete-1',
			athleteName: 'A',
			dateKey: '2026-09-08'
		};
		expect(dayClipboardMode(clipboard, 'athlete-2', '2026-09-08')).toBe('paste');
	});
});

describe('weekClipboardMode', () => {
	it("is 'copy' when nothing is on the clipboard", () => {
		expect(weekClipboardMode(null, 'athlete-1', '2026-09-07')).toBe('copy');
	});

	it("is 'copy' while a day is on the clipboard", () => {
		const clipboard: Clipboard = {
			type: 'day',
			athleteId: 'athlete-1',
			athleteName: 'A',
			dateKey: '2026-09-08'
		};
		expect(weekClipboardMode(clipboard, 'athlete-1', '2026-09-07')).toBe('copy');
	});

	it("is 'cancel' for the exact week that's copied", () => {
		const clipboard: Clipboard = {
			type: 'week',
			athleteId: 'athlete-1',
			athleteName: 'A',
			weekStart: '2026-09-07'
		};
		expect(weekClipboardMode(clipboard, 'athlete-1', '2026-09-07')).toBe('cancel');
	});

	it("is 'paste' for a different week, same athlete", () => {
		const clipboard: Clipboard = {
			type: 'week',
			athleteId: 'athlete-1',
			athleteName: 'A',
			weekStart: '2026-09-07'
		};
		expect(weekClipboardMode(clipboard, 'athlete-1', '2026-09-14')).toBe('paste');
	});

	it("is 'paste' for the selected athlete being null while a week is copied", () => {
		const clipboard: Clipboard = {
			type: 'week',
			athleteId: 'athlete-1',
			athleteName: 'A',
			weekStart: '2026-09-07'
		};
		expect(weekClipboardMode(clipboard, null, '2026-09-07')).toBe('paste');
	});
});
