<script lang="ts">
	import CenteredColumn from '$lib/components/CenteredColumn.svelte';
</script>

<svelte:head>
	<title>Strength App — Waiting for coach</title>
</svelte:head>

<CenteredColumn>
	<div class="card bg-base-100 shadow-sm">
		<div class="card-body">
			<h2 class="card-title">Not linked to a coach yet</h2>
			<p class="text-sm text-base-content/70">
				Your account isn't linked to a coach yet. Ask your coach to invite your email, then sign in
				again.
			</p>
		</div>
	</div>
</CenteredColumn>
