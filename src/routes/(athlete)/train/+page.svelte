<script lang="ts">
	import { page } from '$app/state';
	import LeftFillIcon from '@iconify-svelte/mingcute/left-fill';
	import RightFillIcon from '@iconify-svelte/mingcute/right-fill';
	import { SvelteDate } from 'svelte/reactivity';
	import WorkoutItem from './WorkoutItem.svelte';
	import WorkoutModal from './WorkoutModal.svelte';
	import { getCachedWorkoutDay, getWorkoutDay } from '$lib/services/workoutService.svelte';
	import { initWorkoutState } from '$lib/workoutState.svelte';

	const workout = initWorkoutState();
	let date = new SvelteDate();

	const PULL_THRESHOLD = 96;
	const MAX_PULL = 156;
	const SPINNER_HEIGHT = 76;
	const MIN_SPIN_MS = 850;
	const SPINNER_DOTS = Array.from({ length: 8 }, (_, i) => i);

	const SWIPE_THRESHOLD = 64;
	const AXIS_DEADZONE = 10;
	const EDGE_GUARD = 32;
	const SLIDE_MS = 180;

	let listEl = $state<HTMLDivElement>();
	let pullDistance = $state(0);
	let refreshing = $state(false);
	let dragging = $state(false);
	let swipeX = $state(0);
	let swiping = $state(false); // finger-tracking: transition off
	let snapping = $state(false); // instant reposition: transition off
	let animating = false; // a committed day change is playing out
	let axis: 'x' | 'y' | null = null;
	let tracking = false;
	let loadToken = 0;
	let startX = 0;
	let startY = 0;

	const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
	const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

	/** 0 → 1 as the pull approaches the threshold; drives the spinner fade-in. */
	const pullProgress = $derived(Math.min(pullDistance / PULL_THRESHOLD, 1));

	function changeDate(offset: number) {
		date.setDate(date.getDate() + offset);
	}

	async function loadDay() {
		const athleteId = page.data.user?.id ?? '';
		const dateKey = date.toLocaleDateString('fr-CA');
		// Swiping days fires overlapping loads; only the newest may write state.
		const token = ++loadToken;

		workout.setLocation(athleteId, dateKey);

		// Paint whatever we already know about this day, then reconcile.
		const cached = getCachedWorkoutDay(athleteId, dateKey);
		if (cached) workout.setDay(cached);

		const exercises = await getWorkoutDay(athleteId, dateKey);
		if (token !== loadToken) return;
		workout.setDay(exercises, cached !== null);
	}

	$effect(() => {
		loadDay();
	});

	function gestureStart(x: number, y: number) {
		if (!listEl || refreshing || animating || workout.selected !== null) return;
		// The outer strip belongs to the OS back/forward gesture, which survives even
		// in an installed PWA and cannot be suppressed from a page — so don't contest
		// it; a swipe starting mid-screen is unambiguously ours. The tab bar navigates
		// with replaceState, so in practice there's no history for it to pop.
		if (x < EDGE_GUARD || x > window.innerWidth - EDGE_GUARD) return;
		startX = x;
		startY = y;
		axis = null;
		tracking = true;
	}

	/** Returns true when the gesture is ours and the browser default must yield. */
	function gestureMove(x: number, y: number) {
		if (!tracking || !listEl) return false;
		const dx = x - startX;
		const dy = y - startY;

		// Lock to one axis on the first meaningful movement and stay there for the
		// rest of the gesture, so a swipe can never bleed into a pull, or vice versa.
		if (!axis) {
			if (Math.abs(dx) < AXIS_DEADZONE && Math.abs(dy) < AXIS_DEADZONE) return false;
			if (Math.abs(dx) > Math.abs(dy)) {
				axis = 'x';
				swiping = true;
			} else {
				axis = 'y';
				// Only a downward pull from the very top is ours; anything else is
				// ordinary scrolling, so bow out for the remainder of the gesture.
				if (dy > 0 && listEl.scrollTop === 0) {
					dragging = true;
				} else {
					tracking = false;
					return false;
				}
			}
			// Re-origin at the lock point so the deadzone isn't inherited as a jump.
			startX = x;
			startY = y;
			return true;
		}

		if (axis === 'x') {
			swipeX = dx * 0.85;
			return true;
		}

		return pullMove(y);
	}

	function gestureEnd() {
		if (!tracking) return;
		tracking = false;
		const settled = axis;
		axis = null;
		if (settled === 'x') swipeEnd();
		else pullEnd();
	}

	async function swipeEnd() {
		swiping = false;
		const dir = swipeX <= -SWIPE_THRESHOLD ? 1 : swipeX >= SWIPE_THRESHOLD ? -1 : 0;
		if (!dir) {
			swipeX = 0; // under threshold — springs back
			return;
		}

		animating = true;
		const width = listEl?.clientWidth ?? window.innerWidth;

		// Carry the outgoing day the rest of the way off-screen.
		swipeX = -dir * width;
		await wait(SLIDE_MS);

		changeDate(dir);

		// Park the incoming day on the far edge with the transition suppressed —
		// leaving it on would animate the jump itself and read as a snap backwards.
		snapping = true;
		swipeX = dir * width;
		await frame();
		await frame();
		snapping = false;
		await frame();

		swipeX = 0;
		await wait(SLIDE_MS);
		animating = false;
	}

	/** Returns true while an active downward pull is consuming the gesture. */
	function pullMove(y: number) {
		if (!dragging || !listEl) return false;
		const delta = y - startY;
		if (delta <= 0 || listEl.scrollTop > 0) {
			dragging = false;
			pullDistance = 0;
			return false;
		}
		pullDistance = Math.min(delta * 0.85, MAX_PULL);
		return true;
	}

	async function pullEnd() {
		if (!dragging) return;
		dragging = false;
		const trigger = pullDistance >= PULL_THRESHOLD;
		pullDistance = 0;
		if (!trigger) return;
		refreshing = true;
		try {
			// Hold the spinner briefly even on a fast response, so the refresh reads
			// as a deliberate action instead of a flicker.
			await Promise.all([loadDay(), new Promise<void>((r) => setTimeout(r, MIN_SPIN_MS))]);
		} finally {
			refreshing = false;
		}
	}

	// Touch needs a non-passive listener so a downward pull at the top can
	// preventDefault the native scroll instead of being cancelled by it.
	$effect(() => {
		const el = listEl;
		if (!el) return;

		const onTouchStart = (e: TouchEvent) =>
			gestureStart(e.touches[0].clientX, e.touches[0].clientY);
		const onTouchMove = (e: TouchEvent) => {
			if (gestureMove(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault();
		};

		el.addEventListener('touchstart', onTouchStart, { passive: true });
		el.addEventListener('touchmove', onTouchMove, { passive: false });
		el.addEventListener('touchend', gestureEnd);
		el.addEventListener('touchcancel', gestureEnd);

		return () => {
			el.removeEventListener('touchstart', onTouchStart);
			el.removeEventListener('touchmove', onTouchMove);
			el.removeEventListener('touchend', gestureEnd);
			el.removeEventListener('touchcancel', gestureEnd);
		};
	});
</script>

<div class="grid h-full grid-rows-[auto_1fr]">
	<header class="flex w-full items-center justify-center gap-4 border-b bg-base-100 py-4">
		<button class="btn btn-ghost" onclick={() => changeDate(-1)}>
			<LeftFillIcon height="1.5em" />
		</button>
		<span>
			{date.toLocaleDateString('en-AU', {
				weekday: 'short',
				day: 'numeric',
				month: 'short',
				year: 'numeric'
			})}
		</span>
		<button class="btn btn-ghost" onclick={() => changeDate(1)}>
			<RightFillIcon height="1.5em" />
		</button>
	</header>

	<div
		bind:this={listEl}
		class="touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain"
		role="region"
		aria-label="Scheduled workout"
		onpointerdown={(e) => e.pointerType === 'mouse' && gestureStart(e.clientX, e.clientY)}
		onpointermove={(e) => e.pointerType === 'mouse' && gestureMove(e.clientX, e.clientY)}
		onpointerup={(e) => e.pointerType === 'mouse' && gestureEnd()}
		onpointerleave={(e) => e.pointerType === 'mouse' && gestureEnd()}
	>
		<!-- +1px keeps the list scrollable (and bounceable) even when it's short -->
		<div class="min-h-[calc(100%_+_1px)] pt-4">
			<div
				class="flex items-center justify-center overflow-hidden {dragging
					? ''
					: 'transition-[height] duration-200'}"
				style="height: {refreshing ? SPINNER_HEIGHT : pullDistance}px"
			>
				<!--
					While refreshing the rotation belongs to the animation alone: leaving a
					transform transition on would fight the keyframes and judder. The drag
					ends at rotate(360deg), which is the animation's own start angle, so the
					handoff lands mid-stride.
				-->
				<div
					class="relative size-6 {refreshing
						? 'animate-spin'
						: dragging
							? ''
							: 'transition-[opacity,transform] duration-200'}"
					style="opacity: {refreshing ? 1 : pullProgress};{refreshing
						? ''
						: ` transform: rotate(${pullProgress * 360}deg);`}"
				>
					{#each SPINNER_DOTS as i (i)}
						<span
							class="absolute top-1/2 left-1/2 size-1 rounded-full bg-base-content"
							style="transform: translate(-50%, -50%) rotate({(i / SPINNER_DOTS.length) *
								360}deg) translateY(-10px); opacity: {0.15 +
								(i / (SPINNER_DOTS.length - 1)) * 0.85}"
						></span>
					{/each}
				</div>
			</div>

			<div
				class={swiping || snapping ? '' : 'transition-transform duration-200'}
				style="transform: translateX({swipeX}px)"
			>
				<h2 class="text-lg font-bold">Scheduled Workout</h2>
				{#if workout.exercises.length}
					<ol>
						{#each workout.exercises as exercise, i (exercise.id)}
							<li class="py-2 duration-250 hover:opacity-75">
								<WorkoutItem
									activity={exercise.activity}
									category={exercise.category}
									plan={exercise.plan}
									complete={workout.isComplete(exercise)}
									onselect={() => workout.open(i)}
								/>
							</li>
						{/each}
					</ol>
				{:else}
					<p>No Workout for Today</p>
				{/if}
			</div>

			{#if workout.selected !== null}
				<WorkoutModal />
			{/if}
		</div>
	</div>
</div>
