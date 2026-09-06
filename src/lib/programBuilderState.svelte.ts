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

/** What every `service.*` call resolves to (see `postProgram`) — it never
 *  rejects, so a failed write, network included, is always `{ ok: false }`. */
type OpResult = { ok: true; data: unknown } | { ok: false; error: string };

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
	// Shown near the program header / expanded-session panel when any optimistic
	// op (program / cycle / week / session / exercise create, rename, delete,
	// reorder) failed and was rolled back.
	opError = $state<string | null>(null);
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
		this.opError = null;
		// The clipboard holds a session id from the program being navigated away
		// from; keeping it would offer a confusing cross-program paste.
		this.sessionClipboard = null;
		this.selectedProgram = await service.getProgram(id);
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

	/**
	 * Server call for a program/cycle/week/session change that's ALREADY been
	 * applied to the local tree. On failure runs `rollback` and shows
	 * `failMessage`; on success runs `onSuccess` (used to swap a temp id for the
	 * real one). Tracked so a concurrent reload waits for it.
	 */
	private confirmTreeOp(
		call: Promise<OpResult>,
		rollback: () => void,
		failMessage: string,
		onSuccess?: (data: { id: string }) => void
	) {
		return this.trackOptimistic(
			(async () => {
				const res = await call;
				if (res.ok) onSuccess?.(res.data as { id: string });
				else {
					rollback();
					this.opError = res.error || failMessage;
				}
				return res;
			})()
		);
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
				? (this.findWeek(weekId)?.sessions.find((s) => s.dayNumber === dayNumber)?.id ?? null)
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

	// ---------------------------------------------------------------------
	// Program / cycle / week / session CRUD — every one applies its change to
	// `programs` / `selectedProgram` immediately and reconciles (or rolls back)
	// against the server in the background, same shape as copyPreviousWeek /
	// pasteSession / saveExercise below. The owning modal closes right away.
	// ---------------------------------------------------------------------

	createProgram(name: string, description: string) {
		this.opError = null;
		this.closeModal();

		const temp = tempId();
		const prevId = this.selectedProgramId;
		const prevProgram = this.selectedProgram;
		const prevList = this.programs;

		this.programs = [
			...(this.programs ?? []),
			{ id: temp, name, description, cycleCount: 0, weekCount: 0 }
		];
		this.selectedProgramId = temp;
		this.selectedProgram = { id: temp, name, description, cycles: [] };
		this.expandedWeekId = null;
		this.expandedSessionId = null;
		this.sessionClipboard = null;

		return this.confirmTreeOp(
			service.createProgram(name, description),
			() => {
				this.programs = prevList;
				if (this.selectedProgramId === temp) {
					this.selectedProgramId = prevId;
					this.selectedProgram = prevProgram;
				}
			},
			'Could not create the program.',
			({ id }) => {
				this.programs = (this.programs ?? []).map((p) => (p.id === temp ? { ...p, id } : p));
				if (this.selectedProgramId === temp) this.selectedProgramId = id;
				if (this.selectedProgram?.id === temp)
					this.selectedProgram = { ...this.selectedProgram, id };
			}
		);
	}

	updateProgram(programId: string, name: string, description: string) {
		this.opError = null;
		this.closeModal();

		const prevProgram = this.selectedProgram;
		const prevList = this.programs;
		if (this.selectedProgram?.id === programId)
			this.selectedProgram = { ...this.selectedProgram, name, description };
		this.programs = (this.programs ?? []).map((p) =>
			p.id === programId ? { ...p, name, description } : p
		);

		return this.confirmTreeOp(
			service.updateProgram(programId, name, description),
			() => {
				this.selectedProgram = prevProgram;
				this.programs = prevList;
			},
			'Could not save the program — reverted.'
		);
	}

	deleteProgram(programId: string) {
		this.opError = null;

		const prevId = this.selectedProgramId;
		const prevProgram = this.selectedProgram;
		const prevList = this.programs;
		const wasSelected = this.selectedProgramId === programId;

		const remaining = (this.programs ?? []).filter((p) => p.id !== programId);
		this.programs = remaining;
		if (wasSelected) {
			this.selectedProgramId = remaining[0]?.id ?? null;
			this.selectedProgram = null;
			this.expandedWeekId = null;
			this.expandedSessionId = null;
			this.sessionClipboard = null;
		}

		return this.confirmTreeOp(
			service.deleteProgram(programId),
			() => {
				this.programs = prevList;
				this.selectedProgramId = prevId;
				this.selectedProgram = prevProgram;
			},
			'Could not delete the program — restored.',
			() => {
				// Load the now-selected program's detail — deferred to here so a
				// failed delete's rollback isn't clobbered by an in-flight getProgram.
				if (wasSelected && this.selectedProgramId) void this.selectProgram(this.selectedProgramId);
			}
		);
	}

	saveCycle(
		programId: string,
		cycleId: string | null,
		name: string,
		goal: string,
		colorKey: ColorKey
	) {
		this.opError = null;
		this.closeModal();

		const program = this.selectedProgram;
		if (!program || program.id !== programId) {
			return this.confirmTreeOp(
				cycleId
					? service.updateCycle(cycleId, name, goal, colorKey)
					: service.addCycle(programId, name, goal, colorKey),
				() => {},
				'Could not save the cycle.'
			);
		}

		if (cycleId) {
			const cycle = program.cycles.find((c) => c.id === cycleId);
			const snapshot = cycle && { name: cycle.name, goal: cycle.goal, colorKey: cycle.colorKey };
			if (cycle) {
				cycle.name = name;
				cycle.goal = goal;
				cycle.colorKey = colorKey;
			}
			return this.confirmTreeOp(
				service.updateCycle(cycleId, name, goal, colorKey),
				() => {
					const c = this.selectedProgram?.cycles.find((x) => x.id === cycleId);
					if (c && snapshot) Object.assign(c, snapshot);
				},
				'Could not save the cycle — reverted.'
			);
		}

		const temp = tempId();
		program.cycles.push({
			id: temp,
			name,
			goal,
			colorKey,
			position: program.cycles.length,
			weeks: []
		});
		return this.confirmTreeOp(
			service.addCycle(programId, name, goal, colorKey),
			() => {
				const cycles = this.selectedProgram?.cycles;
				const i = cycles?.findIndex((c) => c.id === temp) ?? -1;
				if (cycles && i !== -1) cycles.splice(i, 1);
			},
			'Could not add the cycle.',
			({ id }) => {
				const c = this.selectedProgram?.cycles.find((x) => x.id === temp);
				if (c) c.id = id;
			}
		);
	}

	removeCycle(cycleId: string) {
		this.opError = null;

		const cycles = this.selectedProgram?.cycles;
		const index = cycles?.findIndex((c) => c.id === cycleId) ?? -1;
		const removed = index !== -1 ? cycles![index] : null;
		if (cycles && index !== -1) cycles.splice(index, 1);
		if (this.expandedWeekId && !this.findWeek(this.expandedWeekId)) {
			this.expandedWeekId = null;
			this.expandedSessionId = null;
		}

		return this.confirmTreeOp(
			service.removeCycle(cycleId),
			() => {
				if (cycles && removed && !cycles.some((c) => c.id === cycleId))
					cycles.splice(Math.min(index, cycles.length), 0, removed);
			},
			'Could not delete the cycle — restored.'
		);
	}

	addWeek(cycleId: string) {
		this.opError = null;

		const cycle = this.selectedProgram?.cycles.find((c) => c.id === cycleId);
		if (!cycle) {
			return this.confirmTreeOp(service.addWeek(cycleId), () => {}, 'Could not add the week.');
		}

		const temp = tempId();
		const weekNumber = (cycle.weeks[cycle.weeks.length - 1]?.weekNumber ?? 0) + 1;
		cycle.weeks.push({ id: temp, weekNumber, sessions: [] });
		this.pendingWeekIds.add(temp);
		this.expandedWeekId = temp;
		this.expandedSessionId = null;

		return this.confirmTreeOp(
			service.addWeek(cycleId),
			() => {
				const loc = this.locateWeek(temp);
				if (loc) loc.weeks.splice(loc.index, 1);
				if (this.expandedWeekId === temp) {
					this.expandedWeekId = null;
					this.expandedSessionId = null;
				}
				this.pendingWeekIds.delete(temp);
			},
			'Could not add the week.',
			({ id }) => {
				const loc = this.locateWeek(temp);
				if (loc) loc.weeks[loc.index].id = id;
				if (this.expandedWeekId === temp) this.expandedWeekId = id;
				this.pendingWeekIds.delete(temp);
			}
		);
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
		const res = await service.duplicateWeek(sourceWeekId);

		const sameProgram = this.selectedProgramId === programId;
		const loc = sameProgram ? this.locateWeek(tempWeekId) : null;

		if (res.ok) {
			const serverWeek = res.data as WeekDetail;
			if (loc) {
				loc.weeks[loc.index] = serverWeek;
				if (this.expandedWeekId === tempWeekId) this.expandedWeekId = serverWeek.id;
			} else if (sameProgram && programId) {
				// A concurrent reload replaced selectedProgram before we could swap
				// the real week in — reload directly rather than lose it.
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

	removeWeek(weekId: string) {
		this.opError = null;

		const loc = this.locateWeek(weekId);
		if (!loc) {
			return this.confirmTreeOp(service.removeWeek(weekId), () => {}, 'Could not delete the week.');
		}
		const { weeks, index } = loc;
		const [removed] = weeks.splice(index, 1);
		if (this.expandedWeekId === weekId) {
			this.expandedWeekId = null;
			this.expandedSessionId = null;
		}

		return this.confirmTreeOp(
			service.removeWeek(weekId),
			() => {
				if (!weeks.some((w) => w.id === weekId))
					weeks.splice(Math.min(index, weeks.length), 0, removed);
			},
			'Could not delete the week — restored.'
		);
	}

	saveSession(weekId: string, dayNumber: number, sessionId: string | null, name: string) {
		this.opError = null;
		this.closeModal();

		if (sessionId) {
			const found = this.findSession(sessionId);
			const prevName = found?.session.name;
			if (found) found.session.name = name;
			return this.confirmTreeOp(
				service.updateSession(sessionId, name),
				() => {
					const f = this.findSession(sessionId);
					if (f && prevName !== undefined) f.session.name = prevName;
				},
				'Could not rename the session — reverted.'
			);
		}

		const week = this.findWeek(weekId);
		if (!week) {
			return this.confirmTreeOp(
				service.addSession(weekId, dayNumber, name),
				() => {},
				'Could not add the session.'
			);
		}

		const temp = tempId();
		week.sessions.push({ id: temp, dayNumber, name, exercises: [] });
		this.pendingSessionIds.add(temp);
		this.expandedWeekId = weekId;
		this.expandedSessionId = temp;

		return this.confirmTreeOp(
			service.addSession(weekId, dayNumber, name),
			() => {
				const loc = this.locateSession(temp);
				if (loc) loc.sessions.splice(loc.index, 1);
				if (this.expandedSessionId === temp) this.expandedSessionId = null;
				this.pendingSessionIds.delete(temp);
			},
			'Could not add the session.',
			({ id }) => {
				const loc = this.locateSession(temp);
				if (loc) loc.sessions[loc.index].id = id;
				if (this.expandedSessionId === temp) this.expandedSessionId = id;
				this.pendingSessionIds.delete(temp);
			}
		);
	}

	removeSession(sessionId: string) {
		this.opError = null;

		const loc = this.locateSession(sessionId);
		if (!loc) {
			return this.confirmTreeOp(
				service.removeSession(sessionId),
				() => {},
				'Could not remove the session.'
			);
		}
		const { sessions, index } = loc;
		const [removed] = sessions.splice(index, 1);
		if (this.expandedSessionId === sessionId) this.expandedSessionId = null;

		return this.confirmTreeOp(
			service.removeSession(sessionId),
			() => {
				if (!sessions.some((s) => s.id === sessionId))
					sessions.splice(Math.min(index, sessions.length), 0, removed);
			},
			'Could not remove the session — restored.'
		);
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
		const res = await service.duplicateSession(sourceSessionId, destWeekId, destDayNumber, replace);

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
	 * reloaded (server truth) and `opError` is shown. The modal closes
	 * itself; this no longer touches modal state.
	 */
	saveExercise(
		sessionId: string,
		programExerciseId: string | null,
		exercise: ProgramExerciseInput
	) {
		this.opError = null;
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
				const res = await service.addProgramExercise(sessionId, exercise);
				if (this.selectedProgramId === programId) {
					const loc = this.locateExercise(tempExId);
					if (res.ok && loc) {
						loc.exercises[loc.index].id = (res.data as { id: string }).id;
					} else if (!res.ok) {
						if (loc) loc.exercises.splice(loc.index, 1);
						this.opError = 'Could not add the exercise — removed.';
					}
				}
				this.pendingExerciseIds.delete(tempExId);
				return res;
			})()
		);
	}

	removeExercise(programExerciseId: string) {
		this.opError = null;
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
		this.opError = null;
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
		call: Promise<OpResult>,
		programId: string | null,
		mode: 'reload-on-fail' | 'always-reload',
		failMessage: string
	) {
		const res = await call;
		if (this.selectedProgramId !== programId) return res;
		if (!res.ok) {
			this.opError = failMessage;
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
