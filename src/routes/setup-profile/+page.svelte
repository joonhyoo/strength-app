<script lang="ts">
	import { enhance } from '$app/forms';
	import { enhanceReplace } from '$lib/forms';
	import CenteredColumn from '$lib/components/CenteredColumn.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let loading = $state(false);
	const handleSubmit = enhanceReplace({
		onSubmit: () => (loading = true),
		onDone: () => (loading = false)
	});
</script>

<svelte:head>
	<title>Strength App — Set up your profile</title>
</svelte:head>

<CenteredColumn>
	<div class="card bg-base-100 shadow-sm">
		<div class="card-body">
			<h2 class="card-title">Set up your profile</h2>
			<p class="text-sm text-base-content/70">
				Your name is visible to your coach. Your username is private — only you can see it.
			</p>

			{#if form?.message}
				<div class="mt-2 rounded-lg bg-error/10 p-3 text-sm text-error">
					{form.message}
				</div>
			{/if}

			<form
				method="POST"
				action="?/save"
				use:enhance={handleSubmit}
				class="mt-2 flex flex-col gap-3"
			>
				<label class="form-control w-full">
					<span class="label-text label text-xs">Name (visible to your coach)</span>
					<input
						name="name"
						type="text"
						value={form?.name ?? ''}
						placeholder="Your name"
						class="input-bordered input w-full"
						required
					/>
				</label>
				<label class="form-control w-full">
					<span class="label-text label text-xs">Username (private, only visible to you)</span>
					<input
						name="username"
						type="text"
						value={form?.username ?? ''}
						placeholder="username"
						class="input-bordered input w-full"
						autocomplete="off"
						required
					/>
				</label>
				<button class="btn w-full btn-primary" disabled={loading}>
					{loading ? 'Saving...' : 'Continue'}
				</button>
			</form>
		</div>
	</div>
</CenteredColumn>
