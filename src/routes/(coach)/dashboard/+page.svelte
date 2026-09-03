<script lang="ts">
	const tiles = [
		{
			title: 'Athlete activity',
			body: "See who's logged workouts recently and who's gone quiet."
		},
		{
			title: 'Upcoming workouts',
			body: 'A quick look at what your athletes have scheduled next.'
		},
		{
			title: 'Completion rates',
			body: 'Track how consistently athletes are finishing assigned work.'
		},
		{
			title: 'Alerts',
			body: 'Flags for missed sessions or athletes needing attention.'
		}
	];
</script>

<svelte:head>
	<title>Strength App — Dashboard</title>
</svelte:head>

<div class="my-4">
	<h1 class="mb-4 font-display text-xl font-bold uppercase">Dashboard</h1>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		{#each tiles as tile (tile.title)}
			<div class="card bg-base-100 shadow-sm">
				<div class="card-body">
					<h2 class="card-title font-display text-base uppercase">{tile.title}</h2>
					<p class="text-sm text-base-content/60">{tile.body}</p>
					<span class="mt-2 badge self-start badge-ghost badge-sm">Coming soon</span>
				</div>
			</div>
		{/each}
	</div>
</div>
