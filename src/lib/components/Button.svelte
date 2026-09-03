<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	// First of this app's own components replacing a DaisyUI primitive — see
	// design_system/src/App.tsx's ButtonSection for the recipe this follows
	// (base: px-5 py-2.5 text-sm font-semibold uppercase tracking-wider
	// rounded-sm; a distinct background/border treatment per variant). Colors
	// and spacing are this app's own tokens/Tailwind's scale throughout, not
	// the reference's raw hex/px values — `rounded-sm` and the size steps
	// below are deliberately Tailwind's own scale, not calc() or one-off em
	// values, so this stays easy to nudge later without fighting arithmetic.
	//
	// `dashed`/`dashed-muted` aren't in the reference's own catalog — they're
	// this app's established "add a new thing" affordance (a dashed border
	// instead of a solid fill), kept as their own variants so that pattern
	// stays consistent everywhere it's used rather than every call site
	// reinventing it.
	//
	// Scope: labeled buttons only for now (this migration's first pass).
	// Icon-only ghost buttons (edit/delete/history/close-style controls)
	// still use DaisyUI's btn-ghost — a deliberate follow-up, not an
	// oversight, since the reference's own catalog has no icon-only variant
	// to model them after.

	type Variant =
		| 'primary'
		| 'secondary'
		| 'outline'
		| 'ghost'
		| 'destructive'
		| 'dashed'
		| 'dashed-muted';
	type Size = 'xs' | 'sm' | 'md';

	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		size?: Size;
		children?: Snippet;
	}

	let {
		variant = 'secondary',
		size = 'md',
		type = 'button',
		class: extraClass = '',
		children,
		...rest
	}: Props = $props();

	const VARIANT_CLASSES: Record<Variant, string> = {
		primary: 'border border-primary bg-primary text-white hover:opacity-90',
		// Deliberately `bg-neutral`, not `bg-secondary` — this app's own
		// --color-secondary (#1e1e22, meant for exactly this) is shadowed by
		// DaisyUI's same-named theme slot (#38bdf8, its "secondary" brand
		// color, used elsewhere for e.g. text-secondary edit-icon accents),
		// which wins the cascade. --color-neutral is the one DaisyUI slot
		// that still points at the dark neutral gray btn-neutral always used,
		// so this reads the same fill through a plain color utility instead
		// of the .btn-neutral component class.
		secondary: 'border border-border bg-neutral text-foreground hover:border-muted-fg',
		outline: 'border border-primary bg-transparent text-primary hover:bg-primary/10',
		ghost: 'border border-transparent bg-transparent text-muted-fg hover:text-foreground',
		destructive: 'border border-danger bg-transparent text-danger hover:bg-danger/10',
		dashed: 'border border-dashed border-border bg-transparent text-primary hover:bg-primary/10',
		'dashed-muted':
			'border border-dashed border-border bg-transparent text-muted-fg hover:text-foreground'
	};

	const SIZE_CLASSES: Record<Size, string> = {
		xs: 'gap-1.5 px-3 py-1 text-xs',
		sm: 'gap-1.5 px-4 py-2 text-xs',
		md: 'gap-2 px-5 py-2.5 text-sm'
	};
</script>

<button
	{type}
	class="inline-flex items-center justify-center rounded-sm font-semibold tracking-wider uppercase transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 {VARIANT_CLASSES[
		variant
	]} {SIZE_CLASSES[size]} {extraClass}"
	{...rest}
>
	{@render children?.()}
</button>
