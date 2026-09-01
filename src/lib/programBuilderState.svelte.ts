import { getContext, setContext } from 'svelte';
import * as service from '$lib/services/programTemplateService.svelte';
import type {
	ProgramSummary,
	ProgramDetail,
	ColorKey,
	ProgramExerciseInput
} from '$lib/services/programTemplateService.svelte';

type ModalState =
	| { type: 'program'; programId: string | null }
	| { type: 'cycle'; programId: string; cycleId: string | null }
	| { type: 'session'; weekId: string; dayNumber: number; sessionId: string | null }
	| { type: 'exercise'; sessionId: string; programExerciseId: string | null }
	| null;

class ProgramBuilderState {
	programs = $state<ProgramSummary[] | null>(null);
	selectedProgramId = $state<string | null>(null);
	selectedProgram = $state<ProgramDetail | null>(null);
	expandedWeekId = $state<string | null>(null);
	expandedSessionId = $state<string | null>(null);
	modal = $state<ModalState>(null);

	async loadPrograms() {
		this.programs = await service.listPrograms();
		if (!this.selectedProgramId && this.programs.length > 0) {
			await this.selectProgram(this.programs[0].id);
		}
	}

	async selectProgram(id: string) {
		this.selectedProgramId = id;
		// A previously-expanded week/session number can coincidentally collide
		// with a different program's own numbering (each program's weeks
		// restart at 1) — reset rather than carry it over.
		this.expandedWeekId = null;
		this.expandedSessionId = null;
		this.selectedProgram = await service.getProgram(id);
	}

	private async refresh() {
		if (this.selectedProgramId) {
			this.selectedProgram = await service.getProgram(this.selectedProgramId);
		}
		this.programs = await service.listPrograms();
	}

	private findWeek(weekId: string) {
		for (const cycle of this.selectedProgram?.cycles ?? []) {
			const week = cycle.weeks.find((w) => w.id === weekId);
			if (week) return week;
		}
		return null;
	}

	/** The day_number of whichever session is currently expanded, if any. */
	private get expandedDayNumber(): number | null {
		if (!this.expandedSessionId || !this.expandedWeekId) return null;
		const session = this.findWeek(this.expandedWeekId)?.sessions.find(
			(s) => s.id === this.expandedSessionId
		);
		return session?.dayNumber ?? null;
	}

	toggleWeek(weekId: string) {
		if (this.expandedWeekId === weekId) {
			this.expandedWeekId = null;
			this.expandedSessionId = null;
			return;
		}

		// Carry the currently open day across to the newly selected week, if it
		// has a session on that same day — flipping through weeks shouldn't
		// lose your place.
		const dayNumber = this.expandedDayNumber;
		this.expandedWeekId = weekId;
		this.expandedSessionId =
			dayNumber !== null
				? (this.findWeek(weekId)?.sessions.find((s) => s.dayNumber === dayNumber)?.id ?? null)
				: null;
	}

	toggleSession(sessionId: string) {
		this.expandedSessionId = this.expandedSessionId === sessionId ? null : sessionId;
	}

	openModal(modal: NonNullable<ModalState>) {
		this.modal = modal;
	}

	closeModal() {
		this.modal = null;
	}

	async createProgram(name: string, description: string) {
		const res = await service.createProgram(name, description);
		if (res.ok) {
			await this.loadPrograms();
			await this.selectProgram(res.data.id);
		}
		this.closeModal();
		return res;
	}

	async updateProgram(programId: string, name: string, description: string) {
		const res = await service.updateProgram(programId, name, description);
		if (res.ok) await this.refresh();
		this.closeModal();
		return res;
	}

	async deleteProgram(programId: string) {
		const res = await service.deleteProgram(programId);
		if (res.ok) {
			this.selectedProgramId = null;
			this.selectedProgram = null;
			await this.loadPrograms();
		}
		return res;
	}

	async saveCycle(
		programId: string,
		cycleId: string | null,
		name: string,
		goal: string,
		colorKey: ColorKey
	) {
		const res = cycleId
			? await service.updateCycle(cycleId, name, goal, colorKey)
			: await service.addCycle(programId, name, goal, colorKey);
		if (res.ok) await this.refresh();
		this.closeModal();
		return res;
	}

	async removeCycle(cycleId: string) {
		const res = await service.removeCycle(cycleId);
		if (res.ok) await this.refresh();
		return res;
	}

	async addWeek(cycleId: string) {
		const res = await service.addWeek(cycleId);
		if (res.ok) {
			await this.refresh();
			this.expandedWeekId = (res.data as { id: string }).id;
			this.expandedSessionId = null;
		}
		return res;
	}

	/** Duplicates the cycle's current last week (sessions, exercises, and sets) into a new one appended after it. */
	async copyPreviousWeek(cycleId: string) {
		const cycle = this.selectedProgram?.cycles.find((c) => c.id === cycleId);
		const lastWeek = cycle?.weeks[cycle.weeks.length - 1];
		if (!lastWeek) return;

		const res = await service.duplicateWeek(lastWeek.id);
		if (res.ok) {
			await this.refresh();
			this.expandedWeekId = (res.data as { id: string }).id;
			this.expandedSessionId = null;
		}
		return res;
	}

	async removeWeek(weekId: string) {
		const res = await service.removeWeek(weekId);
		if (res.ok) {
			if (this.expandedWeekId === weekId) this.expandedWeekId = null;
			await this.refresh();
		}
		return res;
	}

	async saveSession(weekId: string, dayNumber: number, sessionId: string | null, name: string) {
		const res = sessionId
			? await service.updateSession(sessionId, name)
			: await service.addSession(weekId, dayNumber, name);
		if (res.ok) await this.refresh();
		this.closeModal();
		return res;
	}

	async removeSession(sessionId: string) {
		const res = await service.removeSession(sessionId);
		if (res.ok) {
			if (this.expandedSessionId === sessionId) this.expandedSessionId = null;
			await this.refresh();
		}
		return res;
	}

	async saveExercise(
		sessionId: string,
		programExerciseId: string | null,
		exercise: ProgramExerciseInput
	) {
		const res = programExerciseId
			? await service.updateProgramExercise(programExerciseId, exercise)
			: await service.addProgramExercise(sessionId, exercise);
		if (res.ok) await this.refresh();
		this.closeModal();
		return res;
	}

	async removeExercise(programExerciseId: string) {
		const res = await service.removeProgramExercise(programExerciseId);
		if (res.ok) await this.refresh();
		return res;
	}

	async moveExercise(programExerciseId: string, direction: 'up' | 'down') {
		await service.moveProgramExercise(programExerciseId, direction);
		await this.refresh();
	}
}

const KEY = Symbol('program-builder-state');

export function initProgramBuilderState() {
	const state = new ProgramBuilderState();
	setContext(KEY, state);
	return state;
}

export function getProgramBuilderState(): ProgramBuilderState {
	return getContext(KEY);
}
