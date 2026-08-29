<script lang="ts">
	let { gif }: { gif: string } = $props();
</script>

<div class="card m-auto w-full bg-base-100 shadow-sm">
	<figure class="px-10 pt-10">
		<img src={gif} alt="dancing cat" class="rounded-xl" />
	</figure>
	<div class="card-body items-center text-center">
		<h2 class="card-title">Coming Soon!</h2>
		<p>Watch this space.</p>
	</div>
</div>
