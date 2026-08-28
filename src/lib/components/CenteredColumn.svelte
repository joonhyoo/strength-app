<script lang="ts">
	let { children } = $props();
</script>

<div
	class="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top))] max-w-md flex-col justify-center px-4 py-6"
>
	{@render children()}
</div>
