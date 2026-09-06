/**
 * Dates are plain 'YYYY-MM-DD' strings ('fr-CA' locale format) throughout the
 * app. Every conversion goes through a local-time `Date` — never string or
 * interval math — so a DST transition can't shift a key by a day.
 *
 * Deliberately not under `$lib/server`: the browser bundle and server code
 * share this one copy.
 */

/** 'YYYY-MM-DD' → Date at local midnight. */
export function parseKey(key: string): Date {
	const [y, m, d] = key.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** Date → 'YYYY-MM-DD' in local time (not UTC). */
export function toKey(date: Date): string {
	return date.toLocaleDateString('fr-CA');
}

/** `key` shifted by `n` days (negative goes back). */
export function addDays(key: string, n: number): string {
	const d = parseKey(key);
	d.setDate(d.getDate() + n);
	return toKey(d);
}

/** The Monday of `key`'s week (ISO week start). */
export function mondayOf(key: string): string {
	const d = parseKey(key);
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Mon=0 … Sun=6
	return toKey(d);
}

export function isMonday(key: string): boolean {
	return parseKey(key).getDay() === 1;
}

/** Whole-day difference (b − a). Both operands are local midnight, so DST-safe. */
export function diffDays(a: string, b: string): number {
	return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000);
}

/** `key` as a short "5 Mar" display string (the app's `en-AU` convention). */
export function formatDayMonth(key: string): string {
	return parseKey(key).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
