<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { enhanceReplace } from '$lib/forms';
	import { clearClientCaches } from '$lib/clientCache';
</script>

<div class="card m-auto w-full bg-base-100 shadow-sm">
	<figure class="px-10 pt-10">
		<img
			src="https://media.tenor.com/JPOhHuokpdYAAAAi/pop-cat.gif"
			alt="dancing cat"
			class="rounded-xl"
		/>
	</figure>
	<div class="card-body items-center text-center">
		<h2 class="card-title font-display uppercase">{page.data.user?.name}</h2>
		<form
			method="POST"
			action="/auth/login?/logout"
			use:enhance={enhanceReplace({ onDone: () => void clearClientCaches() })}
		>
			<button type="submit" class="btn btn-ghost btn-sm">Log out</button>
		</form>
		<div class="mt-2 flex items-center gap-3 text-xs text-base-content/50">
			<a href="https://hyuji.dev/privacy" target="_blank" rel="noopener" class="link link-hover"
				>Privacy</a
			>
			<span>·</span>
			<a href="https://hyuji.dev/terms" target="_blank" rel="noopener" class="link link-hover"
				>Terms</a
			>
		</div>
	</div>
</div>
