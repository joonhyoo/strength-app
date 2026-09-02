import type { ColorKey } from '$lib/types';

/**
 * The cycle-band palette. Each `key` is a stable string stored in
 * `cycles.color_key` (CHECK-constrained in
 * `20260902000000_cycle_color_palette.sql`); each `css` is a theme token from
 * `src/routes/layout.css`, so a band can never drift from the rest of the
 * app's colors. Order here is the order swatches appear in the picker — a
 * loose spectrum sweep.
 */
export const CYCLE_COLORS: { key: ColorKey; css: string }[] = [
	{ key: 'crimson', css: 'var(--color-danger)' },
	{ key: 'primary', css: 'var(--color-primary)' },
	{ key: 'amber', css: 'var(--color-amber)' },
	{ key: 'cream', css: 'var(--color-cream)' },
	{ key: 'lime', css: 'var(--color-lime)' },
	{ key: 'teal', css: 'var(--color-teal)' },
	{ key: 'sky', css: 'var(--color-sky)' },
	{ key: 'violet', css: 'var(--color-violet)' }
];

/** color_key → CSS, for rendering a saved cycle's band. */
export const CYCLE_COLOR_CSS = Object.fromEntries(
	CYCLE_COLORS.map((c) => [c.key, c.css])
) as Record<ColorKey, string>;

/** DB default (cycles.color_key) — the seed a fresh cycle form starts on. */
export const DEFAULT_CYCLE_COLOR: ColorKey = 'sky';

/** CSS for one saved key, falling back to the default if it's somehow unknown
 *  (e.g. a row from a future palette). */
export function cycleColorCss(key: ColorKey | string): string {
	return CYCLE_COLOR_CSS[key as ColorKey] ?? CYCLE_COLOR_CSS[DEFAULT_CYCLE_COLOR];
}
