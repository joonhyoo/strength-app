import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import {
	addExerciseToDay,
	updateExercise as updateScheduledExercise,
	removeExercise as removeScheduledExercise,
	moveExercise as moveScheduledExercise,
	setExerciseComplete
} from '$lib/services/programService.svelte';
import {
	getAthleteStatusMap,
	getCachedStatusMap,
	dayStatusFromExercises
} from '$lib/services/workoutService.svelte';
import type { DayStatus } from '$lib/complete';
import type { Exercise } from '$lib/types';

class CoachProgramState {
	selectedAthleteId = $state<string | null>(null);
	selectedDate = $state<Date>(new Date());
	modalOpen = $state(false);
	editingExerciseId = $state<string | null>(null);
	statusMap = $state<SvelteMap<string, DayStatus>>(new SvelteMap());
	revision = $state(0);

	selectAthlete(id: string | null) {
		this.selectedAthleteId = id;
	}

	selectDate(date: Date) {
		this.selectedDate = date;
	}

	openModal() {
		this.editingExerciseId = null;
		this.modalOpen = true;
	}

	openEdit(athleteExerciseId: string) {
		this.editingExerciseId = athleteExerciseId;
		this.modalOpen = true;
	}

	closeModal() {
		this.modalOpen = false;
		this.editingExerciseId = null;
	}

	async saveExercise(exercise: Exercise) {
		if (this.selectedAthleteId === null) return;
		const dateKey = this.selectedDate.toLocaleDateString('fr-CA');
		if (this.editingExerciseId !== null) {
			await updateScheduledExercise(this.editingExerciseId, exercise);
		} else {
			await addExerciseToDay(this.selectedAthleteId, dateKey, exercise);
		}
		// The revision bump makes WorkoutTimeline re-fetch this day, which then
		// reports the fresh status via setDayStatus — no separate status-map
		// round trip needed just to update one dot.
		this.revision++;
	}

	async removeExercise(athleteExerciseId: string) {
		await removeScheduledExercise(athleteExerciseId);
		this.revision++;
	}

	async moveExercise(athleteExerciseId: string, direction: 'up' | 'down') {
		await moveScheduledExercise(athleteExerciseId, direction);
		this.revision++;
	}

	async toggleExerciseComplete(athleteExerciseId: string, complete: boolean) {
		await setExerciseComplete(athleteExerciseId, complete);
		this.revision++;
	}

	/** Updates one day's dot locally from exercises already fetched, avoiding a full status-map refetch. */
	setDayStatus(dateKey: string, exercises: Exercise[]) {
		this.statusMap.set(dateKey, dayStatusFromExercises(exercises));
	}

	async loadStatusMap() {
		if (this.selectedAthleteId === null) return;

		// Paint whatever we already know for this athlete, then reconcile.
		const cached = getCachedStatusMap(this.selectedAthleteId);
		if (cached) this.statusMap = cached;

		const DAY_MS = 24 * 60 * 60 * 1000;
		const now = Date.now();
		const from = new Date(now - 180 * DAY_MS);
		const to = new Date(now + 60 * DAY_MS);

		this.statusMap = await getAthleteStatusMap(this.selectedAthleteId, {
			from: from.toLocaleDateString('fr-CA'),
			to: to.toLocaleDateString('fr-CA')
		});
	}
}

const COACH_KEY = Symbol('coach-program-state');

export function initCoachProgramState() {
	const state = new CoachProgramState();
	setContext(COACH_KEY, state);
	return state;
}

export function getCoachProgramState(): CoachProgramState {
	return getContext(COACH_KEY);
}
