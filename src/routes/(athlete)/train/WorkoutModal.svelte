<script lang="ts">
	import ArrowLeftFillIcon from '@iconify-svelte/mingcute/arrow-left-fill';
	import ArrowRightFillIcon from '@iconify-svelte/mingcute/arrow-right-fill';
	import HistoryIcon from '@iconify-svelte/mingcute/history-2-line';
	import CloseFillIcon from '@iconify-svelte/mingcute/close-fill';
	import CheckFillIcon from '@iconify-svelte/mingcute/check-fill';
	import { getWorkoutState } from '$lib/workoutState.svelte';
	import { CONDITIONING_CATEGORIES } from '$lib/complete';
	import { resolveVideoEmbed } from '$lib/videoEmbed';
	import ExerciseHistoryModal from './ExerciseHistoryModal.svelte';

	const workout = getWorkoutState();

	const videoEmbed = $derived(resolveVideoEmbed(workout.selected?.videoUrl));

	let dialog = $state() as HTMLDialogElement;
	let historyOpen = $state(false);
	let closing = false;

	// Defer showModal() a frame so the browser paints the closed state first —
	// a full-screen box with no transition start otherwise snaps in.
	$effect(() => {
		const raf = requestAnimationFrame(() => dialog.showModal());
		return () => {
			cancelAnimationFrame(raf);
			if (dialog.open) dialog.close();
		};
	});

	/** Drop `[open]` so DaisyUI's `.modal` fade-out plays, then clear the
	 *  selection (which unmounts us) once it's done. */
	function closeModal() {
		if (closing) return;
		closing = true;
		dialog.close();
		setTimeout(() => workout.close(), 250);
	}

	// Swipe-between-exercises — the same slide-out/reposition/slide-in
	// choreography as the day list's swipe-between-days (train/+page.svelte),
	// so the two feel identical. The prev/next buttons drive the very same
	// goTo(), so a tap and a swipe animate the same way.
	const SWIPE_THRESHOLD = 64;
	const AXIS_DEADZONE = 10;
	const EDGE_GUARD = 32;
	const SLIDE_MS = 180;

	let swipeEl = $state<HTMLDivElement>();
	let swipeX = $state(0);
	let swiping = $state(false); // finger-tracking: transition off
	let snapping = $state(false); // instant reposition: transition off
	let animating = $state(false); // a committed exercise change is playing out — read in the template to disable prev/next mid-slide
	let axis: 'x' | 'y' | null = null;
	let tracking = false;
	let startX = 0;
	let startY = 0;

	const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
	const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

	/** prev/next move to a different exercise — the open history view no longer
	 *  matches, so close it as we go. Shared by both the buttons and a
	 *  released swipe; a no-op past either boundary, or mid-animation. */
	async function goTo(dir: -1 | 1) {
		if (animating) return;
		if (dir === -1 ? !workout.hasPrev : !workout.hasNext) {
			swipeX = 0; // dragged past the boundary — spring back
			return;
		}
		historyOpen = false;
		animating = true;
		const width = swipeEl?.clientWidth ?? window.innerWidth;

		// Carry the outgoing exercise the rest of the way off-screen.
		swipeX = -dir * width;
		await wait(SLIDE_MS);

		if (dir === -1) workout.prev();
		else workout.next();

		// Park the incoming exercise on the far edge with the transition
		// suppressed — leaving it on would animate the jump itself and read
		// as a snap backwards.
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

	function step(dir: -1 | 1) {
		void goTo(dir);
	}

	function gestureStart(x: number, y: number) {
		if (!swipeEl || animating) return;
		if (x < EDGE_GUARD || x > window.innerWidth - EDGE_GUARD) return;
		startX = x;
		startY = y;
		axis = null;
		tracking = true;
	}

	/** Returns true when the gesture is ours and the browser default must yield. */
	function gestureMove(x: number, y: number) {
		if (!tracking) return false;
		const dx = x - startX;
		const dy = y - startY;

		// Lock to one axis on the first meaningful movement — a vertical move
		// belongs to the content's own scroll, not the swipe.
		if (!axis) {
			if (Math.abs(dx) < AXIS_DEADZONE && Math.abs(dy) < AXIS_DEADZONE) return false;
			if (Math.abs(dx) <= Math.abs(dy)) {
				tracking = false;
				return false;
			}
			axis = 'x';
			swiping = true;
			// Re-origin at the lock point so the deadzone isn't inherited as a jump.
			startX = x;
			startY = y;
			return true;
		}

		swipeX = dx * 0.85;
		return true;
	}

	function gestureEnd() {
		if (!tracking) return;
		tracking = false;
		if (axis === 'x') swipeEnd();
		axis = null;
	}

	async function swipeEnd() {
		swiping = false;
		const dir = swipeX <= -SWIPE_THRESHOLD ? 1 : swipeX >= SWIPE_THRESHOLD ? -1 : 0;
		if (!dir) {
			swipeX = 0; // under threshold — springs back
			return;
		}
		await goTo(dir);
	}

	// Touch needs a non-passive listener so a confirmed horizontal drag can
	// preventDefault the native scroll instead of being cancelled by it.
	$effect(() => {
		const el = swipeEl;
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

	const canShowHistory = $derived(
		workout.selected?.category === 'weight' &&
			!!workout.selected.exerciseId &&
			!!workout.location.athleteId
	);

	// The two flanking buttons (history left, complete right) render for every category
	// except `note`. When their action isn't available they show disabled rather than
	// vanish, so the centre nav pill keeps its position.
	const showSideButtons = $derived(
		workout.selected !== null && workout.selected.category !== 'note'
	);

	// Only conditioning completion is a manual toggle; `weight` is auto-derived, so its
	// button reflects state but is dimmed + non-interactive.
	const completeInteractive = $derived(
		workout.selected !== null && CONDITIONING_CATEGORIES.includes(workout.selected.category)
	);

	// Transparent hit target inside the shared pill — only the icon colour
	// reacts to a press, and it eases.
	const navBtn =
		'flex size-12 cursor-pointer items-center justify-center rounded-full text-base-content/80 transition-colors duration-150 active:text-base-content/45 disabled:cursor-default disabled:text-base-content/20';
</script>

{#if workout.selected !== null}
	<dialog
		bind:this={dialog}
		class="modal"
		onclose={closeModal}
		oncancel={(e) => {
			e.preventDefault();
			if (historyOpen) historyOpen = false;
			else closeModal();
		}}
	>
		<div
			class="relative modal-box flex h-full max-h-none w-full max-w-[750px] flex-col overflow-hidden rounded-none px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center sm:pt-8 sm:pb-8 md:border-x md:border-base-300"
			style="scale:1"
		>
			<div
				bind:this={swipeEl}
				class="flex min-h-0 flex-1 touch-pan-y flex-col {swiping || snapping
					? ''
					: 'transition-transform duration-200'}"
				style="transform: translateX({swipeX}px)"
				role="group"
				aria-label="Exercise details"
				onpointerdown={(e) => e.pointerType === 'mouse' && gestureStart(e.clientX, e.clientY)}
				onpointermove={(e) => e.pointerType === 'mouse' && gestureMove(e.clientX, e.clientY)}
				onpointerup={(e) => e.pointerType === 'mouse' && gestureEnd()}
				onpointerleave={(e) => e.pointerType === 'mouse' && gestureEnd()}
			>
				<h3 class="mt-4 mb-4 shrink-0 px-4 font-display text-lg font-bold uppercase">
					{workout.selected.activity}
				</h3>

				{#if videoEmbed}
					<div class="mb-4 shrink-0 overflow-hidden rounded-lg bg-black">
						<div class="relative aspect-video w-full">
							{#if videoEmbed.kind === 'iframe'}
								<iframe
									class="absolute inset-0 h-full w-full"
									src={videoEmbed.src}
									title="{workout.selected.activity} demo video"
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
									allowfullscreen
								></iframe>
							{:else}
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									class="absolute inset-0 h-full w-full"
									src={videoEmbed.src}
									controls
									playsinline
								></video>
							{/if}
						</div>
					</div>
				{/if}

				<div class="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
					{#if workout.selected.note.length}
						<div
							class="my-4 rounded-lg bg-neutral/30 p-4 whitespace-pre-wrap {workout.selected
								.category === 'note'
								? 'text-left'
								: ''}"
						>
							{workout.selected.note}
						</div>
					{/if}
					{#if workout.selected.category === 'weight'}
						<table class="table">
							<thead>
								<tr>
									<th>Sets</th>
									<th>Weight</th>
									<th>Reps</th>
								</tr>
							</thead>
							<tbody>
								{#each workout.selected.performed as set, i (i)}
									<tr>
										<th>{i + 1}</th>
										<td>
											<input
												type="number"
												class="input"
												value={set.weight}
												oninput={(e) => workout.logSet(i, 'weight', e.currentTarget.value)}
												name="weight"
											/>
										</td>
										<td>
											<input
												type="number"
												class="input"
												value={set.reps || workout.selected.plan[i]}
												oninput={(e) => workout.logSet(i, 'reps', e.currentTarget.value)}
												name="reps"
											/>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			</div>

			{#if workout.saveError}
				<p class="shrink-0 pb-2 text-center text-xs text-error">{workout.saveError}</p>
			{/if}

			<div class="flex shrink-0 items-center justify-center gap-4">
				{#if showSideButtons}
					<button
						type="button"
						class={[
							'btn btn-circle size-12 btn-ghost',
							!canShowHistory && 'pointer-events-none opacity-50'
						]}
						aria-label="Previous sessions"
						aria-disabled={canShowHistory ? undefined : true}
						tabindex={canShowHistory ? undefined : -1}
						onclick={canShowHistory ? () => (historyOpen = true) : undefined}
					>
						<HistoryIcon class="size-6" />
					</button>
				{/if}

				<div class="flex items-center justify-around gap-3 rounded-full bg-base-300 p-1">
					<button
						type="button"
						class={navBtn}
						disabled={!workout.hasPrev || animating}
						aria-label="Previous exercise"
						onclick={() => step(-1)}
					>
						<ArrowLeftFillIcon class="size-6" />
					</button>
					<button type="button" class={navBtn} aria-label="Close" onclick={closeModal}>
						<CloseFillIcon class="size-6" />
					</button>
					<button
						type="button"
						class={navBtn}
						disabled={!workout.hasNext || animating}
						aria-label="Next exercise"
						onclick={() => step(1)}
					>
						<ArrowRightFillIcon class="size-6" />
					</button>
				</div>

				{#if showSideButtons}
					{@const done = workout.isComplete(workout.selected)}
					<button
						type="button"
						class={[
							'btn btn-circle size-12',
							done ? 'btn-success' : 'btn-soft',
							!completeInteractive && 'pointer-events-none opacity-50'
						]}
						aria-label={done ? 'Completed' : 'Mark complete'}
						aria-pressed={completeInteractive ? done : undefined}
						aria-disabled={completeInteractive ? undefined : true}
						tabindex={completeInteractive ? undefined : -1}
						onclick={completeInteractive ? () => workout.toggleComplete() : undefined}
					>
						<CheckFillIcon class="size-6" />
					</button>
				{/if}
			</div>

			{#if historyOpen && canShowHistory && workout.selected.exerciseId}
				<ExerciseHistoryModal
					athleteId={workout.location.athleteId}
					exerciseId={workout.selected.exerciseId}
					activity={workout.selected.activity}
					before={workout.location.dateKey}
					onclose={() => (historyOpen = false)}
				/>
			{/if}
		</div>
	</dialog>
{/if}
