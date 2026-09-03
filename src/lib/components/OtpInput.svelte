<script lang="ts">
	const LENGTH = 6;

	let {
		value = $bindable(''),
		oncomplete
	}: {
		value?: string;
		oncomplete?: () => void;
	} = $props();

	let boxes = $state<string[]>(Array.from({ length: LENGTH }, () => ''));
	let inputs: HTMLInputElement[] = [];

	// `boxes` -> `value` is pushed explicitly at each local mutation site below
	// (fill/handleInput/handleKeydown) rather than via an effect watching
	// `boxes` — an effect there would race the one below on an external clear:
	// it'd see stale (unreset) `boxes` and write the old code straight back
	// into `value` before the reset effect below ever saw `value === ''`.
	$effect(() => {
		if (value === '') boxes = Array.from({ length: LENGTH }, () => '');
	});

	// A single typed digit lands at `startIndex`. Anything longer (a paste,
	// or mobile autofill dropping the whole code into one box) is treated as
	// the full code and always restarts from the first box, truncated to
	// LENGTH — regardless of which box it landed in.
	function fill(digits: string, startIndex: number) {
		const clean = digits.replace(/\D/g, '');
		if (!clean) return;

		const from = clean.length > 1 ? 0 : startIndex;
		const next = [...boxes];
		let i = from;
		for (const digit of clean.slice(0, LENGTH - from)) {
			next[i] = digit;
			i++;
		}
		boxes = next;
		value = next.join('');

		// A box can end up with leftover native characters the browser inserted
		// (e.g. typing a second digit into an already-filled box before it's
		// cleared) that don't match where `fill` decided that digit belongs.
		// Force every box's DOM value back in line with state so nothing lingers.
		for (let k = 0; k < LENGTH; k++) {
			const el = inputs[k];
			if (el && el.value !== next[k]) el.value = next[k];
		}

		const focusIndex = Math.min(i, LENGTH - 1);
		inputs[focusIndex]?.focus();
		if (i >= LENGTH) inputs[LENGTH - 1]?.blur();

		if (next.every((d) => d !== '')) oncomplete?.();
	}

	function handleInput(index: number, e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const raw = target.value;

		if (raw === '') {
			// Backspace/delete emptied this box — commit the clear.
			if (boxes[index] !== '') {
				const next = [...boxes];
				next[index] = '';
				boxes = next;
				value = next.join('');
			}
			return;
		}

		if (!/\d/.test(raw)) {
			// A non-digit character was typed. Since state doesn't change here,
			// Svelte won't re-sync the DOM on its own — reset the box's native
			// value back to what state actually holds, or it'd show a
			// "ghost" character that fill() silently ignored.
			target.value = boxes[index];
			return;
		}

		fill(raw, index);
	}

	function handleKeydown(index: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && boxes[index] === '' && index > 0) {
			e.preventDefault();
			const next = [...boxes];
			next[index - 1] = '';
			boxes = next;
			value = next.join('');
			inputs[index - 1]?.focus();
		}
	}

	function handlePaste(index: number, e: ClipboardEvent) {
		const pasted = e.clipboardData?.getData('text') ?? '';
		if (!pasted) return;
		e.preventDefault();
		fill(pasted, index);
	}
</script>

<div class="flex justify-center gap-2">
	{#each boxes as digit, i (i)}
		<input
			bind:this={inputs[i]}
			value={digit}
			oninput={(e) => handleInput(i, e)}
			onkeydown={(e) => handleKeydown(i, e)}
			onpaste={(e) => handlePaste(i, e)}
			type="text"
			inputmode="numeric"
			pattern="[0-9]*"
			maxlength={i === 0 ? LENGTH : 1}
			autocomplete={i === 0 ? 'one-time-code' : 'off'}
			aria-label="Digit {i + 1} of {LENGTH}"
			class="input h-14 w-11 text-center text-2xl font-semibold"
		/>
	{/each}
</div>
