import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import {
	addExerciseToDay,
	updateExercise as updateScheduledExercise,
	removeExercise as removeScheduledExercise,
	moveExercise as moveScheduledExercise,
	setExerciseComplete
} from '$lib/services/programService.svelte';
import { getAthleteStatusMap, getCachedStatusMap } from '$lib/services/workoutService.svelte';
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
		await this.loadStatusMap();
		this.revision++;
	}

	async removeExercise(athleteExerciseId: string) {
		await removeScheduledExercise(athleteExerciseId);
		await this.loadStatusMap();
		this.revision++;
	}

	async moveExercise(athleteExerciseId: string, direction: 'up' | 'down') {
		await moveScheduledExercise(athleteExerciseId, direction);
		this.revision++;
	}

	async toggleExerciseComplete(athleteExerciseId: string, complete: boolean) {
		await setExerciseComplete(athleteExerciseId, complete);
		await this.loadStatusMap();
		this.revision++;
	}

	async loadStatusMap() {
		if (this.selectedAthleteId === null) return;

		// Paint whatever we already know for this athlete, then reconcile.
		const cached = getCachedStatusMap(this.selectedAthleteId);
		if (cached) this.statusMap = cached;

		this.statusMap = await getAthleteStatusMap(this.selectedAthleteId);
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
