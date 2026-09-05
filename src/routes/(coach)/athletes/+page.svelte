<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { enhanceReplace } from '$lib/forms';
	import Delete3LineIcon from '@iconify-svelte/mingcute/delete-3-line';
	import Button from '$lib/components/Button.svelte';
	import type { Athlete } from '$lib/types';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	type PendingInvite = { id: string; email: string; created_at: string };

	// `athletes`/`pendingInvites` are streamed from their `load` functions —
	// null until the promise resolves, so the rest of the page can render
	// immediately instead of waiting on them.
	let athletes = $state<Athlete[] | null>(null);
	let pendingInvites = $state<PendingInvite[] | null>(null);

	$effect(() => {
		(page.data.athletes as Promise<Athlete[]>).then((list) => (athletes = list));
	});
	$effect(() => {
		(page.data.pendingInvites as Promise<PendingInvite[]>).then((list) => (pendingInvites = list));
	});

	let inviting = $state(false);
	let removing = $state(false);
	let query = $state('');

	const filteredAthletes = $derived.by(() => {
		if (athletes === null) return null;
		const q = query.trim().toLowerCase();
		return q
			? athletes.filter(
					(a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
				)
			: athletes;
	});
</script>

<svelte:head>
	<title>Strength App — Athletes</title>
</svelte:head>

<div class="my-4">
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
		<aside class="card h-fit bg-base-100 shadow-sm lg:sticky lg:top-4 lg:z-10 lg:self-start">
			<div class="card-body">
				<h1 class="mb-2 font-display text-xl font-bold uppercase">Athletes</h1>

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
						class="input w-full"
						required
					/>
					<Button variant="primary" type="submit" disabled={inviting}>
						{inviting ? 'Inviting...' : 'Invite'}
					</Button>
				</form>
				{#if form?.message && form?.action !== 'remove_athlete'}
					<p class="mt-1 text-xs text-error">{form.message}</p>
				{/if}

				{#if pendingInvites === null}
					<div class="mt-3 flex flex-col gap-2">
						<div class="h-4 w-full skeleton"></div>
						<div class="h-4 w-2/3 skeleton"></div>
					</div>
				{:else if pendingInvites.length}
					<ul class="mt-3 flex flex-col gap-1">
						{#each pendingInvites as invite (invite.id)}
							<li class="flex items-center justify-between gap-2 text-sm">
								<span class="truncate">{invite.email}</span>
								<form method="POST" action="?/revoke_invite" use:enhance={enhanceReplace({})}>
									<input type="hidden" name="email" value={invite.email} />
									<Button variant="ghost" size="sm" type="submit">Revoke</Button>
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
					<h2 class="card-title font-display text-base uppercase">Your athletes</h2>
					<span class="text-sm text-base-content/60">{athletes?.length ?? ''}</span>
				</div>

				{#if form?.message && form?.action === 'remove_athlete'}
					<p class="mt-1 text-xs text-error">{form.message}</p>
				{/if}

				<input
					type="search"
					placeholder="Search by name or email…"
					class="input input-sm mt-2 w-full max-w-xs"
					bind:value={query}
				/>

				{#if filteredAthletes === null}
					<div class="mt-3 flex flex-col divide-y divide-base-200">
						{#each [0, 1, 2] as n (n)}
							<div class="flex items-center justify-between gap-2 py-2">
								<div class="flex flex-col gap-1">
									<div class="h-4 w-32 skeleton"></div>
									<div class="h-3 w-40 skeleton"></div>
								</div>
							</div>
						{/each}
					</div>
				{:else if filteredAthletes.length}
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
										class="btn text-error btn-ghost btn-sm"
										aria-label={`Remove ${athlete.name}`}
										disabled={removing}
									>
										<Delete3LineIcon class="size-5" />
									</button>
								</form>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-4 text-sm text-base-content/60">
						{(athletes?.length ?? 0)
							? 'No athletes match your search.'
							: 'No athletes yet — invite one above.'}
					</p>
				{/if}
			</div>
		</div>
	</div>
</div>
