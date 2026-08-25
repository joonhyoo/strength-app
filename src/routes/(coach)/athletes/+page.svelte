<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { enhanceReplace } from '$lib/forms';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import type { Athlete } from '$lib/types';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const athletes = $derived(page.data.athletes as Athlete[]);
	const pendingInvites = $derived(
		page.data.pendingInvites as { id: string; email: string; created_at: string }[]
	);

	let inviting = $state(false);
	let removing = $state(false);
	let query = $state('');

	const filteredAthletes = $derived(
		query.trim()
			? athletes.filter((a) => {
					const q = query.trim().toLowerCase();
					return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
				})
			: athletes
	);
</script>

<svelte:head>
	<title>Strength App — Athletes</title>
</svelte:head>

<div class="my-4 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
	<aside class="card h-fit bg-base-100 shadow-sm">
		<div class="card-body">
			<span class="text-xs font-semibold tracking-wide text-base-content/60 uppercase">
				Invite athlete
			</span>
			<form
				method="POST"
				action="?/invite_athlete"
				use:enhance={enhanceReplace({
					onSubmit: () => (inviting = true),
					onDone: () => (inviting = false)
				})}
				class="mt-2 flex gap-2"
			>
				<input
					name="email"
					type="email"
					placeholder="athlete@email.com"
					class="input-bordered input input-sm w-full"
					required
				/>
				<button type="submit" class="btn btn-sm btn-primary" disabled={inviting}>
					{inviting ? 'Inviting...' : 'Invite'}
				</button>
			</form>
			{#if form?.message && form?.action !== 'remove_athlete'}
				<p class="mt-1 text-xs text-error">{form.message}</p>
			{/if}

			{#if pendingInvites.length}
				<ul class="mt-3 flex flex-col gap-1">
					{#each pendingInvites as invite (invite.id)}
						<li class="flex items-center justify-between gap-2 text-sm">
							<span class="truncate">{invite.email}</span>
							<form method="POST" action="?/revoke_invite" use:enhance={enhanceReplace({})}>
								<input type="hidden" name="email" value={invite.email} />
								<button type="submit" class="btn btn-ghost btn-xs">Revoke</button>
							</form>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-1 text-sm text-base-content/60">No pending invites.</p>
			{/if}
		</div>
	</aside>

	<div class="card bg-base-100 shadow-sm">
		<div class="card-body">
			<div class="flex items-center justify-between gap-2">
				<h2 class="card-title text-base">Your athletes</h2>
				<span class="text-sm text-base-content/60">{athletes.length}</span>
			</div>

			{#if form?.message && form?.action === 'remove_athlete'}
				<p class="mt-1 text-xs text-error">{form.message}</p>
			{/if}

			<input
				type="search"
				placeholder="Search by name or email…"
				class="input-bordered input input-sm mt-2 w-full max-w-xs"
				bind:value={query}
			/>

			{#if filteredAthletes.length}
				<ul class="mt-3 flex flex-col divide-y divide-base-200">
					{#each filteredAthletes as athlete (athlete.id)}
						<li class="flex items-center justify-between gap-2 py-1">
							<a
								href={resolve(`/training/${athlete.id}`)}
								class="flex flex-1 items-center justify-between gap-2 rounded-lg py-2 hover:bg-base-200/50"
							>
								<div>
									<p class="font-medium">{athlete.name}</p>
									<p class="text-xs text-base-content/60">{athlete.email}</p>
								</div>
								<span class="text-xs text-base-content/40">View training →</span>
							</a>
							<form
								method="POST"
								action="?/remove_athlete"
								use:enhance={enhanceReplace({
									confirm: () =>
										confirm(`Warning: are you sure you want to remove ${athlete.name}?`),
									onSubmit: () => (removing = true),
									onDone: () => (removing = false)
								})}
							>
								<input type="hidden" name="athlete_id" value={athlete.id} />
								<button
									type="submit"
									class="btn text-error btn-ghost btn-xs"
									aria-label={`Remove ${athlete.name}`}
									disabled={removing}
								>
									<Delete3LineIcon height="1.2em" />
								</button>
							</form>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-4 text-sm text-base-content/60">
					{athletes.length
						? 'No athletes match your search.'
						: 'No athletes yet — invite one above.'}
				</p>
			{/if}
		</div>
	</div>
</div>
