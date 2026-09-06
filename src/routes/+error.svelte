<script lang="ts">
	import { page } from '$app/state';

	const isNotFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{isNotFound ? 'Page not found' : 'Something went wrong'} — Strength App</title>
</svelte:head>

<div
	class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-4 text-center"
>
	<p class="font-display text-6xl font-bold text-primary">{page.status}</p>

	<h1 class="font-display text-2xl font-bold uppercase">
		{isNotFound ? 'Page not found' : 'Something went wrong'}
	</h1>

	<p class="text-base-content/60">
		{#if isNotFound}
			That page doesn't exist, or it moved.
		{:else}
			An unexpected error occurred and has been logged. Try again in a moment.
		{/if}
	</p>

	{#if page.error?.errorId}
		<p class="font-mono text-xs break-all text-base-content/40">
			Reference: {page.error.errorId}
		</p>
	{/if}

	<div class="mt-1 flex flex-wrap justify-center gap-2">
		{#if !isNotFound}
			<button class="btn btn-sm" onclick={() => location.reload()}>Reload</button>
		{/if}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/" class="btn btn-sm btn-primary">Go home</a>
	</div>
</div>
