<script lang="ts">
	// One button that cycles through the copy → paste → cancel states of a
	// clipboard-style copy/paste, replacing a separate Copy and Paste pair. The
	// caller derives `mode` from the shared clipboard (see CoachProgramState's
	// dayClipboardMode / weekClipboardMode) and this just renders the matching
	// affordance. Copy and Paste share the plain `secondary` look — they're
	// never both on screen, so the label carries the difference; only Cancel
	// (the copied source) stands out, as an unfilled primary outline. All three
	// share a min-width so the button doesn't resize as the label changes.
	let {
		mode,
		noun,
		canCopy = true,
		size = 'sm',
		class: extraClass = 'min-w-32',
		oncopy,
		onpaste,
		oncancel
	}: {
		/** 'copy': nothing of this kind is on the clipboard. 'paste': something
		 * was copied elsewhere and this target can receive it. 'cancel': this is
		 * the copied source. */
		mode: 'copy' | 'paste' | 'cancel';
		/** Fills the label: "Copy {noun}" / "Paste {noun}". */
		noun: string;
		/** Only consulted in the 'copy' state. */
		canCopy?: boolean;
		size?: 'xs' | 'sm' | 'md';
		/** Defaults to a min-width so the button doesn't resize as its label
		 * changes between Copy/Paste/Cancel; pass a class (e.g. `w-full`) to
		 * take over sizing entirely. */
		class?: string;
		oncopy: () => void;
		onpaste: () => void;
		oncancel: () => void;
	} = $props();
</script>

{#if mode === 'cancel'}
	<button
		type="button"
		class="btn {extraClass} btn-outline btn-primary btn-{size}"
		onclick={oncancel}
	>
		Cancel
	</button>
{:else if mode === 'paste'}
	<button type="button" class="btn {extraClass} btn-neutral btn-{size}" onclick={onpaste}>
		Paste {noun}
	</button>
{:else}
	<button
		type="button"
		class="btn {extraClass} btn-neutral btn-{size}"
		disabled={!canCopy}
		onclick={oncopy}
	>
		Copy {noun}
	</button>
{/if}
