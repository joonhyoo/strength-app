<script lang="ts">
	import { resolve } from '$app/paths';
	import BarbellLineIcon from '@iconify-svelte/mingcute/barbell-line';
</script>

<svelte:head>
	<title>Strength App</title>
</svelte:head>

<div
	class="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top))] max-w-md flex-col items-center justify-center gap-6 px-4 text-center"
>
	<div class="text-primary">
		<BarbellLineIcon class="size-14" />
	</div>

	<h1 class="font-display text-4xl font-bold uppercase">Strength App</h1>
	<p class="text-base-content/60">Programmed by your coach. Tracked by you.</p>

	<a href={resolve('/auth/login')} class="btn w-full max-w-xs btn-primary">Sign In</a>
</div>
