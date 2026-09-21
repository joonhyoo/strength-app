import { getContext, setContext } from 'svelte';
import * as service from '$lib/services/programTemplateService.svelte';
import type {
	ProgramSummary,
	ProgramDetail,
	ColorKey,
	ProgramExerciseInput
} from '$lib/services/programTemplateService.svelte';
import { locateExercise, findWeek, findSession } from '$lib/programBuilderTree';
import { runWrite, writeQueueBusy } from '$lib/writeQueue.svelte';

/** What every `service.*` write call resolves to (see `postProgram`) — it never
 *  rejects, so a failed write, network included, is always `{ ok: false }`.
 *  `error` is present only for a 4xx; otherwise the caller shows `failMessage`. */
type OpResult = { ok: true; data: unknown } | { ok: false; error?: string };

type ModalState =
	| { type: 'program'; programId: string | null }
	// The cycle a form is editing; the program it belongs to is always the
	// selected one, so it isn't part of the payload (see saveCycle).
	| { type: 'cycle'; cycleId: string | null }
	| { type: 'session'; weekId: string; dayNumber: number; sessionId: string | null }
	| {
			type: 'exercise';
			sessionId: string;
			programExerciseId: string | null;
			// 'note' opens the modal's plain-note form; absent/'exercise' is the full form.
			mode?: 'exercise' | 'note';
	  }
	| null;

/** A session picked up with "Copy" in the week grid (see the state's
 *  `sessionClipboard`). Exported so the week grid and the state share one
 *  definition. */
export interface SessionClipboard {
	sessionId: string;
	sessionName: string;
	sourceWeekId: string;
	sourceDayNumber: number;
}

class ProgramBuilderState {
	programs = $state<ProgramSummary[] | null>(null);
	selectedProgramId = $state<string | null>(null);
	selectedProgram = $state<ProgramDetail | null>(null);
	expandedWeekId = $state<string | null>(null);
	expandedSessionId = $state<string | null>(null);
	modal = $state<ModalState>(null);
	sessionClipboard = $state<SessionClipboard | null>(null);
	// Shown above the program tree when any failed op (program / cycle / week /
	// session / exercise create, rename, delete, reorder, paste, copy) left the
	// tree untouched. The open modal shows its own inline error first when one
	// is open; this banner covers button-triggered ops (add/copy week, paste,
	// delete).
	opError = $state<string | null>(null);
	// A failed listPrograms/getProgram read ("Could not load..."). listPrograms
	// and getProgram reject on failure (see fetchApi) so an outage can never
	// pass for "no programs yet" or a blank editor; shown in ProgramList.
	loadError = $state<string | null>(null);

	/** True while any server write is on the queue — buttons that start another
	 *  write disable themselves against this so two can't interleave. */
	get busy(): boolean {
		return writeQueueBusy();
	}

	async loadPrograms() {
		this.loadError = null;
		try {
			this.programs = await service.listPrograms();
		} catch {
			// Fail loud: an empty list is "no programs yet", not "couldn't load".
			this.programs = [];
			this.loadError = 'Could not load programs — check your connection and reload.';
			return;
		}
		if (!this.selectedProgramId && this.programs.length > 0) {
			await this.selectProgram(this.programs[0].id);
		}
	}

	async selectProgram(id: string) {
		const prevId = this.selectedProgramId;
		this.selectedProgramId = id;
		// A previously-expanded week/session number can coincidentally collide
		// with a different program's own numbering (each program's weeks
		// restart at 1) — reset rather than carry it over.
		this.expandedWeekId = null;
		this.expandedSessionId = null;
		this.opError = null;
		// The clipboard holds a session id from the program being navigated away
		// from; keeping it would offer a confusing cross-program paste.
		this.sessionClipboard = null;
		try {
			const detail = await service.getProgram(id);
			if (this.selectedProgramId !== id) return; // stale — a newer selection owns the editor
			this.selectedProgram = detail;
			this.loadError = null;
		} catch {
			// Abort the switch rather than drop the coach into a blank editor:
			// the previous program stays selected and the failure is shown.
			if (this.selectedProgramId !== id) return;
			this.selectedProgramId = prevId;
			this.loadError = 'Could not load this program — check your connection and try again.';
		}
	}

	/** The day_number of whichever session is currently expanded, if any. */
	private get expandedDayNumber(): number | null {
		if (!this.expandedSessionId || !this.expandedWeekId) return null;
		const session = findWeek(this.selectedProgram, this.expandedWeekId)?.sessions.find(
			(s) => s.id === this.expandedSessionId
		);
		return session?.dayNumber ?? null;
	}

	toggleWeek(weekId: string) {
		this.opError = null;
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
				? (findWeek(this.selectedProgram, weekId)?.sessions.find((s) => s.dayNumber === dayNumber)
						?.id ?? null)
				: null;
	}

	toggleSession(sessionId: string) {
		this.opError = null;
		this.expandedSessionId = this.expandedSessionId === sessionId ? null : sessionId;
	}

	openModal(modal: NonNullable<ModalState>) {
		this.modal = modal;
	}

	closeModal() {
		this.modal = null;
	}

	/**
	 * Runs a server write on the serial queue. On failure nothing changed
	 * locally, so the error is surfaced and the caller keeps whatever modal is
	 * open. On success the program is refetched (server truth) and
	 * `afterSuccess` runs any small local bookkeeping (list sync, expansion).
	 * Every CRUD method below funnels through here.
	 */
	private async write(
		call: Promise<OpResult>,
		failMessage: string,
		afterSuccess?: (res: OpResult) => void
	): Promise<OpResult> {
		const programId = this.selectedProgramId;
		return runWrite(async () => {
			const res = await call;
			if (!res.ok) {
				this.opError = res.error || failMessage;
				return res;
			}
			if (programId && this.selectedProgramId !== programId) {
				// The coach navigated to another program while the write was
				// queued — nothing local to refresh for this one.
				return res;
			}
			await this.refresh(programId);
			afterSuccess?.(res);
			return res;
		});
	}

	/** Best-effort program refetch after a successful write. A failed refetch
	 *  keeps the current tree standing and surfaces the read error — never
	 *  blanks the editor the way the old "getProgram → null" behaviour did. */
	private async refresh(programId: string | null) {
		if (!programId) return;
		try {
			const detail = await service.getProgram(programId);
			if (this.selectedProgramId === programId) this.selectedProgram = detail;
		} catch {
			if (this.selectedProgramId === programId) this.opError = 'Could not refresh the program.';
		}
	}

	// ---------------------------------------------------------------------
	// Program / cycle / week / session CRUD — each awaits the server write,
	// then reloads the program. Nothing is applied optimistically, so a failed
	// write can't leave the tree half-edited. The owning modal stays open until
	// the write resolves, showing its inline error on failure and closing on
	// success.
	// ---------------------------------------------------------------------

	async createProgram(name: string, description: string) {
		this.opError = null;
		return runWrite(async () => {
			const res = await service.createProgram(name, description);
			if (!res.ok) {
				this.opError = res.error || 'Could not create the program.';
				return res;
			}
			const id = (res.data as { id: string }).id;
			this.programs = [...(this.programs ?? []), { id, name }];
			this.selectedProgramId = id;
			this.selectedProgram = null;
			this.expandedWeekId = null;
			this.expandedSessionId = null;
			this.sessionClipboard = null;
			await this.refresh(id);
			return res;
		});
	}

	async updateProgram(programId: string, name: string, description: string) {
		this.opError = null;
		return this.write(
			service.updateProgram(programId, name, description),
			'Could not save the program.',
			() => {
				// Keep the sidebar list's label in sync with the saved name.
				this.programs = (this.programs ?? []).map((p) => (p.id === programId ? { ...p, name } : p));
			}
		);
	}

	async deleteProgram(programId: string) {
		this.opError = null;
		return runWrite(async () => {
			const res = await service.deleteProgram(programId);
			if (!res.ok) {
				this.opError = res.error || 'Could not delete the program.';
				return res;
			}
			const remaining = (this.programs ?? []).filter((p) => p.id !== programId);
			this.programs = remaining;
			if (this.selectedProgramId === programId) {
				// Select the next program in the list (like before the delete
				// happened); the editor briefly clears, then loads its detail.
				this.selectedProgram = null;
				this.expandedWeekId = null;
				this.expandedSessionId = null;
				this.sessionClipboard = null;
				const nextId = remaining[0]?.id ?? null;
				this.selectedProgramId = nextId;
				if (nextId) await this.selectProgram(nextId);
			}
			return res;
		});
	}

	async saveCycle(cycleId: string | null, name: string, goal: string, colorKey: ColorKey) {
		this.opError = null;
		const programId = this.selectedProgramId;
		if (!programId) return { ok: false, error: 'No program selected.' };
		return this.write(
			cycleId
				? service.updateCycle(cycleId, name, goal, colorKey)
				: service.addCycle(programId, name, goal, colorKey),
			cycleId ? 'Could not save the cycle.' : 'Could not add the cycle.'
		);
	}

	async removeCycle(cycleId: string) {
		this.opError = null;
		return this.write(service.removeCycle(cycleId), 'Could not delete the cycle.', () => {
			// Collapse the week grid if its week went away with the cycle.
			if (this.expandedWeekId && !findWeek(this.selectedProgram, this.expandedWeekId)) {
				this.expandedWeekId = null;
				this.expandedSessionId = null;
			}
		});
	}

	async addWeek(cycleId: string) {
		this.opError = null;
		return this.write(service.addWeek(cycleId), 'Could not add the week.', () => {
			// Open the freshly-added (now last) week.
			const cycle = this.selectedProgram?.cycles.find((c) => c.id === cycleId);
			const last = cycle?.weeks[cycle.weeks.length - 1];
			if (last) {
				this.expandedWeekId = last.id;
				this.expandedSessionId = null;
			}
		});
	}

	async copyPreviousWeek(cycleId: string) {
		this.opError = null;
		const cycle = this.selectedProgram?.cycles.find((c) => c.id === cycleId);
		const lastWeek = cycle?.weeks[cycle.weeks.length - 1];
		if (!cycle || !lastWeek) return { ok: false, error: 'No week to copy.' };
		return this.write(service.duplicateWeek(lastWeek.id), 'Could not copy the week.', () => {
			// The duplicated week is appended, so the cycle's last week is the copy.
			const c = this.selectedProgram?.cycles.find((x) => x.id === cycleId);
			const last = c?.weeks[c.weeks.length - 1];
			if (last) {
				this.expandedWeekId = last.id;
				this.expandedSessionId = null;
			}
		});
	}

	async removeWeek(weekId: string) {
		this.opError = null;
		return this.write(service.removeWeek(weekId), 'Could not delete the week.', () => {
			if (this.expandedWeekId && !findWeek(this.selectedProgram, this.expandedWeekId)) {
				this.expandedWeekId = null;
				this.expandedSessionId = null;
			}
		});
	}

	async saveSession(weekId: string, dayNumber: number, sessionId: string | null, name: string) {
		this.opError = null;
		return this.write(
			sessionId
				? service.updateSession(sessionId, name)
				: service.addSession(weekId, dayNumber, name),
			sessionId ? 'Could not rename the session.' : 'Could not add the session.'
		);
	}

	async removeSession(sessionId: string) {
		this.opError = null;
		return this.write(service.removeSession(sessionId), 'Could not remove the session.', () => {
			if (this.expandedSessionId === sessionId) this.expandedSessionId = null;
		});
	}

	/** Picks up a session for pasting onto another day. No-op if the id isn't in the loaded program. */
	copySession(sessionId: string) {
		const found = findSession(this.selectedProgram, sessionId);
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
	 * session appears only after the server write succeeds.
	 */
	async pasteSession(destWeekId: string, destDayNumber: number, replace: boolean) {
		this.opError = null;
		const clip = this.sessionClipboard;
		if (!clip) return { ok: false, error: 'Nothing copied to paste.' };
		return this.write(
			service.duplicateSession(clip.sessionId, destWeekId, destDayNumber, replace),
			'Could not paste the session.',
			() => {
				// Open the pasted day once the reloaded program shows it.
				const week = findWeek(this.selectedProgram, destWeekId);
				const pasted = week?.sessions.find((s) => s.dayNumber === destDayNumber);
				if (pasted) {
					this.expandedWeekId = destWeekId;
					this.expandedSessionId = pasted.id;
				}
			}
		);
	}

	async saveExercise(
		sessionId: string,
		programExerciseId: string | null,
		exercise: ProgramExerciseInput
	) {
		this.opError = null;
		return this.write(
			programExerciseId
				? service.updateProgramExercise(programExerciseId, exercise)
				: service.addProgramExercise(sessionId, exercise),
			programExerciseId ? 'Could not save the exercise.' : 'Could not add the exercise.'
		);
	}

	async removeExercise(programExerciseId: string) {
		this.opError = null;
		return this.write(
			service.removeProgramExercise(programExerciseId),
			'Could not remove the exercise.'
		);
	}

	/** `toIndex` is the desired final position of the exercise in the full
	 *  sibling list (matches the array index the drag ends on). This is the one
	 *  intentionally-optimistic op: the row's new spot is applied locally right
	 *  before the queued write, and a follow-up reload re-confirms server
	 *  truth (undoing the drop visually if the reorder failed). */
	moveExerciseTo(programExerciseId: string, toIndex: number) {
		this.opError = null;
		return runWrite(async () => {
			const loc = locateExercise(this.selectedProgram, programExerciseId);
			if (loc && toIndex !== loc.index) {
				const { exercises, index } = loc;
				const [item] = exercises.splice(index, 1);
				const dest = Math.max(0, Math.min(toIndex, exercises.length));
				exercises.splice(dest, 0, item);
				const res = await service.reorderProgramExercise(programExerciseId, toIndex);
				if (!res.ok) {
					this.opError = res.error || 'Could not reorder the exercises — reverted.';
					return res;
				}
				await this.refresh(this.selectedProgramId);
				return res;
			}
			// Not in the tree (e.g. removed by an earlier queued write) or a
			// no-op drop — nothing to reorder.
			return { ok: true, data: {} };
		});
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
