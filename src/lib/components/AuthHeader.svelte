<script lang="ts">
	// The mark + wordmark + heading for /auth/login (used by AuthForm.svelte).
	// The mark is inlined here, not <img src="/favicon.svg"> — this is the first
	// screen after the cold-launch splash lifts, and an image that hasn't
	// decoded yet would flash a gap where the mark should be.
	let { title = 'Sign in' }: { title?: string } = $props();
</script>

<div class="mb-6 text-center">
	<!-- data-app-mark: the cold-launch splash mark glides to this one on reveal
	     (src/routes/+layout.svelte's dismissSplash). -->
	<svg
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		class="mx-auto mb-2 h-14 w-14"
		aria-hidden="true"
		data-app-mark
	>
		<defs>
			<linearGradient id="authMarkGradient" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stop-color="#F1E0C5" />
				<stop offset="50%" stop-color="#F46036" />
				<stop offset="100%" stop-color="#D7263D" />
			</linearGradient>
		</defs>
		<path
			fill="url(#authMarkGradient)"
			d="M 21.6,7.231 L 21.6,15.603 A 0.645,0.645 0 0,1 21.308,16.109 L 21.033,16.273 C 19.665,17.065 18.46,17.762 17.243,18.464 L 17.243,9.41 L 9.404,4.878 C 10.761,4.099 12.113,3.313 13.471,2.538 A 0.647,0.647 0 0,1 14.055,2.538 L 21.599,6.894 L 21.599,7.231 L 21.6,7.231 M 14.549,11.792 L 14.549,18.071 A 0.484,0.484 0 0,1 14.329,18.451 L 14.124,18.574 C 13.097,19.168 12.194,19.691 11.281,20.217 L 11.281,13.427 L 5.402,10.028 C 6.419,9.444 7.433,8.854 8.452,8.272 A 0.485,0.485 0 0,1 8.89,8.272 L 14.548,11.54 L 14.548,11.792 L 14.549,11.792 M 9.26,15.213 L 9.26,19.923 A 0.363,0.363 0 0,1 9.096,20.207 L 8.941,20.3 C 8.172,20.745 7.494,21.137 6.81,21.532 L 6.81,16.439 L 2.4,13.89 C 3.163,13.452 3.923,13.009 4.687,12.573 A 0.364,0.364 0 0,1 5.016,12.573 L 9.259,15.024 L 9.259,15.213 L 9.26,15.213"
		/>
	</svg>
	<p class="mb-1 block text-xs font-semibold tracking-wide text-base-content/60 uppercase">
		Strength App
	</p>
	<h1 class="font-display text-2xl font-bold uppercase">{title}</h1>
</div>
