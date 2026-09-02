import { getContext, setContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import * as service from '$lib/services/programTemplateService.svelte';
import type {
	ProgramSummary,
	ProgramDetail,
	ColorKey,
	ProgramExerciseInput
} from '$lib/services/programTemplateService.svelte';
import type { WeekDetail, SessionDetail, ProgramExerciseDetail } from '$lib/types';

/** Rebuilds a week/session subtree with fresh temp- ids at every level, so it
 *  can be rendered immediately and later reconciled against (or removed in
 *  favour of) the server's real copy. */
// A session-monotonic counter, not crypto.randomUUID(): these ids are only ever
// matched with `.startsWith('temp-')` and never parsed, they only need to be
// unique within one page load, and — unlike crypto.randomUUID() — this works
// outside a secure context (e.g. running the dev server over a LAN IP).
let tempSeq = 0;
function tempId() {
	return `temp-${++tempSeq}`;
}

function cloneSessionForOptimism(src: SessionDetail, dayNumber = src.dayNumber): SessionDetail {
	return {
		id: tempId(),
		dayNumber,
		name: src.name,
		exercises: src.exercises.map((e) => ({
			id: tempId(),
			activity: e.activity,
			category: e.category,
			note: e.note,
			plan: [...e.plan]
		}))
	};
}

function cloneWeekForOptimism(src: WeekDetail): WeekDetail {
	return {
		id: tempId(),
		// Cosmetic on the client (CycleBand renders positional "week i + 1"); the
		// server assigns the real week_number and it comes back on reconcile.
		weekNumber: src.weekNumber + 1,
		sessions: src.sessions.map((s) => cloneSessionForOptimism(s))
	};
}

type ModalState =
	| { type: 'program'; programId: string | null }
	| { type: 'cycle'; programId: string; cycleId: string | null }
	| { type: 'session'; weekId: string; dayNumber: number; sessionId: string | null }
	| {
			type: 'exercise';
			sessionId: string;
			programExerciseId: string | null;
			// 'note' opens the modal's plain-note form; absent/'exercise' is the full form.
			mode?: 'exercise' | 'note';
	  }
	| null;

class ProgramBuilderState {
	programs = $state<ProgramSummary[] | null>(null);
	selectedProgramId = $state<string | null>(null);
	selectedProgram = $state<ProgramDetail | null>(null);
	expandedWeekId = $state<string | null>(null);
	expandedSessionId = $state<string | null>(null);
	modal = $state<ModalState>(null);
	// A session picked up with "Copy" in the week grid, held until it's pasted
	// onto another day or explicitly cleared. sourceWeekId/sourceDayNumber only
	// exist to grey out the origin cell when its own week is the one on screen.
	sessionClipboard = $state<{
		sessionId: string;
		sessionName: string;
		sourceWeekId: string;
		sourceDayNumber: number;
	} | null>(null);

	// Temp ids of nodes inserted optimistically (copyPreviousWeek / pasteSession /
	// a brand-new exercise from saveExercise) and still being reconciled with the
	// server. CycleBand freezes (inert) any node whose id is in here so an edit
	// can't fire against a temp- id before the real one lands.
	pendingWeekIds = $state(new SvelteSet<string>());
	pendingSessionIds = $state(new SvelteSet<string>());
	pendingExerciseIds = $state(new SvelteSet<string>());
	// Shown briefly in the expanded-session panel when an optimistic exercise
	// op (add / edit / remove / reorder) failed and was rolled back.
	exerciseOpError = $state<string | null>(null);
	// Every in-flight optimistic op (server write + local reconcile). refresh()
	// waits on these so a concurrent mutation's refetch can't replace
	// selectedProgram out from under an optimistic node. Plain Set — only ever
	// awaited, never read reactively.
	private pendingOps = new Set<Promise<unknown>>();

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
		this.exerciseOpError = null;
		// The clipboard holds a session id from the program being navigated away
		// from; keeping it would offer a confusing cross-program paste.
		this.sessionClipboard = null;
		this.selectedProgram = await service.getProgram(id);
	}

	private async refresh() {
		// Let any in-flight optimistic op finish reconciling first — otherwise
		// this refetch replaces selectedProgram before the op can swap its real
		// node in, orphaning it. Re-checks in case another op starts while we wait.
		while (this.pendingOps.size > 0) {
			await Promise.allSettled([...this.pendingOps]);
		}
		if (this.selectedProgramId) {
			this.selectedProgram = await service.getProgram(this.selectedProgramId);
		}
		this.programs = await service.listPrograms();
	}

	private locateWeek(weekId: string): { weeks: WeekDetail[]; index: number } | null {
		for (const cycle of this.selectedProgram?.cycles ?? []) {
			const index = cycle.weeks.findIndex((w) => w.id === weekId);
			if (index !== -1) return { weeks: cycle.weeks, index };
		}
		return null;
	}

	private locateSession(sessionId: string): { sessions: SessionDetail[]; index: number } | null {
		for (const cycle of this.selectedProgram?.cycles ?? []) {
			for (const week of cycle.weeks) {
				const index = week.sessions.findIndex((s) => s.id === sessionId);
				if (index !== -1) return { sessions: week.sessions, index };
			}
		}
		return null;
	}

	private locateExercise(
		programExerciseId: string
	): { exercises: ProgramExerciseDetail[]; index: number; sessionId: string } | null {
		for (const cycle of this.selectedProgram?.cycles ?? []) {
			for (const week of cycle.weeks) {
				for (const session of week.sessions) {
					const index = session.exercises.findIndex((e) => e.id === programExerciseId);
					if (index !== -1) return { exercises: session.exercises, index, sessionId: session.id };
				}
			}
		}
		return null;
	}

	private trackOptimistic<T>(op: Promise<T>): Promise<T> {
		this.pendingOps.add(op);
		void op.finally(() => this.pendingOps.delete(op));
		return op;
	}

	private findWeek(weekId: string) {
		for (const cycle of this.selectedProgram?.cycles ?? []) {
			const week = cycle.weeks.find((w) => w.id === weekId);
			if (week) return week;
		}
		return null;
	}

	private findSession(sessionId: string) {
		for (const cycle of this.selectedProgram?.cycles ?? []) {
			for (const week of cycle.weeks) {
				const session = week.sessions.find((s) => s.id === sessionId);
				if (session) return { session, weekId: week.id };
			}
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
		this.exerciseOpError = null;
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
		this.exerciseOpError = null;
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

	/**
	 * Duplicates the cycle's current last week. The new week renders immediately
	 * from a local clone (temp ids), then reconciles with the server's real copy
	 * — or is removed if that copy fails. Returns the reconcile promise so the
	 * caller can surface an error and knows when the pending state clears.
	 */
	copyPreviousWeek(cycleId: string) {
		const cycle = this.selectedProgram?.cycles.find((c) => c.id === cycleId);
		const lastWeek = cycle?.weeks[cycle.weeks.length - 1];
		if (!cycle || !lastWeek || lastWeek.id.startsWith('temp-')) return;

		const optimistic = cloneWeekForOptimism(lastWeek);
		cycle.weeks.push(optimistic);
		this.pendingWeekIds.add(optimistic.id);
		this.expandedWeekId = optimistic.id;
		this.expandedSessionId = null;

		return this.trackOptimistic(
			this.runWeekCopy(lastWeek.id, optimistic.id, this.selectedProgramId)
		);
	}

	private async runWeekCopy(sourceWeekId: string, tempWeekId: string, programId: string | null) {
		const res = await service
			.duplicateWeek(sourceWeekId)
			.catch(() => ({ ok: false as const, error: 'Request failed.' }));

		const sameProgram = this.selectedProgramId === programId;
		const loc = sameProgram ? this.locateWeek(tempWeekId) : null;

		if (res.ok) {
			const serverWeek = res.data as WeekDetail;
			if (loc) {
				loc.weeks[loc.index] = serverWeek;
				if (this.expandedWeekId === tempWeekId) this.expandedWeekId = serverWeek.id;
			} else if (sameProgram && programId) {
				// A concurrent refetch replaced selectedProgram before we could
				// swap the real week in. refresh() now waits on pendingOps so
				// this is close to unreachable — reload directly rather than lose it.
				this.selectedProgram = await service.getProgram(programId);
			}
		} else if (loc) {
			loc.weeks.splice(loc.index, 1);
			if (this.expandedWeekId === tempWeekId) {
				this.expandedWeekId = null;
				this.expandedSessionId = null;
			}
		}

		this.pendingWeekIds.delete(tempWeekId);
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

	/** Picks up a session for pasting onto another day. No-op if the id isn't in the loaded program. */
	copySession(sessionId: string) {
		const found = this.findSession(sessionId);
		if (!found) return;
		this.sessionClipboard = {
			sessionId,
			sessionName: found.session.name,
			sourceWeekId: found.weekId,
			sourceDayNumber: found.session.dayNumber
		};
	}

	clearSessionClipboard() {
		this.sessionClipboard = null;
	}

	/**
	 * Copies the clipboard session onto destWeekId's given day. `replace` must
	 * be set by the caller when that day already has a session — the server
	 * refuses the paste otherwise rather than silently merging. The pasted
	 * session renders immediately from a local clone, then reconciles with the
	 * server copy (or is rolled back on failure).
	 */
	pasteSession(destWeekId: string, destDayNumber: number, replace: boolean) {
		const clip = this.sessionClipboard;
		if (!clip) return;
		const source = this.findSession(clip.sessionId)?.session;
		const targetWeek = this.findWeek(destWeekId);
		if (!source || source.id.startsWith('temp-') || !targetWeek) return;

		const optimistic = cloneSessionForOptimism(source, destDayNumber);
		if (replace) {
			const i = targetWeek.sessions.findIndex((s) => s.dayNumber === destDayNumber);
			if (i !== -1) targetWeek.sessions.splice(i, 1);
		}
		targetWeek.sessions.push(optimistic);
		this.pendingSessionIds.add(optimistic.id);
		this.expandedWeekId = destWeekId;
		this.expandedSessionId = optimistic.id;

		return this.trackOptimistic(
			this.runSessionPaste(
				clip.sessionId,
				destWeekId,
				destDayNumber,
				replace,
				optimistic.id,
				this.selectedProgramId
			)
		);
	}

	private async runSessionPaste(
		sourceSessionId: string,
		destWeekId: string,
		destDayNumber: number,
		replace: boolean,
		tempSessionId: string,
		programId: string | null
	) {
		const res = await service
			.duplicateSession(sourceSessionId, destWeekId, destDayNumber, replace)
			.catch(() => ({ ok: false as const, error: 'Request failed.' }));

		const sameProgram = this.selectedProgramId === programId;

		if (res.ok) {
			const serverSession = res.data as SessionDetail;
			const loc = sameProgram ? this.locateSession(tempSessionId) : null;
			if (loc) {
				loc.sessions[loc.index] = serverSession;
				if (this.expandedSessionId === tempSessionId) this.expandedSessionId = serverSession.id;
			} else if (sameProgram && programId) {
				this.selectedProgram = await service.getProgram(programId);
			}
		} else if (sameProgram) {
			if (replace && programId) {
				// The server may have already deleted the day's previous session
				// before failing — it can't be safely restored locally, so reload.
				this.selectedProgram = await service.getProgram(programId);
			} else {
				const loc = this.locateSession(tempSessionId);
				if (loc) loc.sessions.splice(loc.index, 1);
				if (this.expandedSessionId === tempSessionId) this.expandedSessionId = null;
			}
		}

		this.pendingSessionIds.delete(tempSessionId);
		return res;
	}

	/**
	 * Adds or edits an exercise on a session — applied to selectedProgram
	 * immediately, server call in the background. On failure the program is
	 * reloaded (server truth) and `exerciseOpError` is shown. The modal closes
	 * itself; this no longer touches modal state.
	 */
	saveExercise(
		sessionId: string,
		programExerciseId: string | null,
		exercise: ProgramExerciseInput
	) {
		this.exerciseOpError = null;
		const session = this.findSession(sessionId)?.session;
		const plan = exercise.category === 'weight' ? [...exercise.plan] : [];
		const programId = this.selectedProgramId;
		const isEdit = !!programExerciseId && !programExerciseId.startsWith('temp-');

		// Edit — patch the exercise in place.
		if (isEdit) {
			const target = session?.exercises.find((e) => e.id === programExerciseId);
			if (target) {
				target.activity = exercise.activity;
				target.category = exercise.category;
				target.note = exercise.note;
				target.plan = plan;
			}
			return this.trackOptimistic(
				this.confirmExerciseOp(
					service.updateProgramExercise(programExerciseId!, exercise),
					programId,
					target ? 'reload-on-fail' : 'always-reload',
					'Could not save the exercise — reverted.'
				)
			);
		}

		// Add — append an optimistic row, swap in the real id on success.
		if (!session) {
			return this.trackOptimistic(
				this.confirmExerciseOp(
					service.addProgramExercise(sessionId, exercise),
					programId,
					'always-reload',
					'Could not add the exercise.'
				)
			);
		}
		const tempExId = tempId();
		session.exercises.push({
			id: tempExId,
			activity: exercise.activity,
			category: exercise.category,
			note: exercise.note,
			plan
		});
		this.pendingExerciseIds.add(tempExId);

		return this.trackOptimistic(
			(async () => {
				const res = await service
					.addProgramExercise(sessionId, exercise)
					.catch(() => ({ ok: false as const, error: 'Request failed.' }));
				if (this.selectedProgramId === programId) {
					const loc = this.locateExercise(tempExId);
					if (res.ok && loc) {
						loc.exercises[loc.index].id = (res.data as { id: string }).id;
					} else if (!res.ok) {
						if (loc) loc.exercises.splice(loc.index, 1);
						this.exerciseOpError = 'Could not add the exercise — removed.';
					}
				}
				this.pendingExerciseIds.delete(tempExId);
				return res;
			})()
		);
	}

	removeExercise(programExerciseId: string) {
		this.exerciseOpError = null;
		const loc = this.locateExercise(programExerciseId);
		const appliedLocally = !!loc && !programExerciseId.startsWith('temp-');
		if (appliedLocally) loc.exercises.splice(loc.index, 1);
		return this.trackOptimistic(
			this.confirmExerciseOp(
				service.removeProgramExercise(programExerciseId),
				this.selectedProgramId,
				appliedLocally ? 'reload-on-fail' : 'always-reload',
				'Could not remove the exercise — restored.'
			)
		);
	}

	/** `toIndex` is the desired final position of the exercise in the full
	 *  sibling list (matches the array index the drag ends on). */
	moveExerciseTo(programExerciseId: string, toIndex: number) {
		this.exerciseOpError = null;
		const loc = this.locateExercise(programExerciseId);
		if (loc && !programExerciseId.startsWith('temp-')) {
			const { exercises, index } = loc;
			if (toIndex === index) return;
			const [item] = exercises.splice(index, 1);
			const dest = Math.max(0, Math.min(toIndex, exercises.length));
			exercises.splice(dest, 0, item);
			return this.trackOptimistic(
				this.confirmExerciseOp(
					service.reorderProgramExercise(programExerciseId, toIndex),
					this.selectedProgramId,
					'reload-on-fail',
					'Could not reorder — reverted.'
				)
			);
		}
		return this.trackOptimistic(
			this.confirmExerciseOp(
				service.reorderProgramExercise(programExerciseId, toIndex),
				this.selectedProgramId,
				'always-reload',
				'Could not reorder.'
			)
		);
	}

	/**
	 * Awaits an exercise mutation that's already been applied to the tree.
	 * 'reload-on-fail' reloads the program only if the call fails (undoing the
	 * optimistic change); 'always-reload' also reloads on success (used when
	 * nothing was applied locally, so the change lives only on the server).
	 */
	private async confirmExerciseOp(
		call: Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
		programId: string | null,
		mode: 'reload-on-fail' | 'always-reload',
		failMessage: string
	) {
		const res = await call.catch(() => ({ ok: false as const, error: 'Request failed.' }));
		if (this.selectedProgramId !== programId) return res;
		if (!res.ok) {
			this.exerciseOpError = failMessage;
			await this.reload(programId);
		} else if (mode === 'always-reload') {
			await this.reload(programId);
		}
		return res;
	}

	/** Direct program refetch — used from inside a tracked op, where refresh()
	 *  would deadlock waiting on that same op. */
	private async reload(programId: string | null) {
		if (programId) this.selectedProgram = await service.getProgram(programId);
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
