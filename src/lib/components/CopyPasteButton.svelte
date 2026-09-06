<script lang="ts">
	import Button from './Button.svelte';

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
		oncopy: () => void;
		onpaste: () => void;
		oncancel: () => void;
	} = $props();
</script>

{#if mode === 'cancel'}
	<Button variant="outline" size="sm" class="min-w-32" onclick={oncancel}>Cancel</Button>
{:else if mode === 'paste'}
	<Button variant="secondary" size="sm" class="min-w-32" onclick={onpaste}>Paste {noun}</Button>
{:else}
	<Button variant="secondary" size="sm" class="min-w-32" disabled={!canCopy} onclick={oncopy}>
		Copy {noun}
	</Button>
{/if}
