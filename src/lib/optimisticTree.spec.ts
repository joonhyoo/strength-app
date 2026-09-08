import { describe, it, expect } from 'vitest';
import {
	tempId,
	trackOptimistic,
	cloneSessionForOptimism,
	cloneWeekForOptimism
} from '$lib/optimisticTree';
import type { SessionDetail, WeekDetail } from '$lib/types';

describe('tempId', () => {
	it('returns a temp- prefixed id', () => {
		expect(tempId()).toMatch(/^temp-/);
	});

	it('returns a distinct id on every call', () => {
		const ids = new Set([tempId(), tempId(), tempId()]);
		expect(ids.size).toBe(3);
	});
});

describe('trackOptimistic', () => {
	it('adds the op to pendingOps synchronously', () => {
		const pendingOps = new Set<Promise<unknown>>();
		const op = Promise.resolve('done');
		trackOptimistic(pendingOps, op);
		expect(pendingOps.has(op)).toBe(true);
	});

	it('removes the op once it resolves', async () => {
		const pendingOps = new Set<Promise<unknown>>();
		const op = Promise.resolve('done');
		trackOptimistic(pendingOps, op);
		await op;
		// The cleanup is chained via op.finally(), which settles in a microtask
		// after `op` itself — flush the queue before asserting it's gone.
		await Promise.resolve();
		expect(pendingOps.has(op)).toBe(false);
	});

	it('removes the op once it rejects', async () => {
		const pendingOps = new Set<Promise<unknown>>();
		const op = Promise.reject(new Error('fail'));
		trackOptimistic(pendingOps, op);
		await expect(op).rejects.toThrow('fail');
		await Promise.resolve();
		expect(pendingOps.has(op)).toBe(false);
	});

	it('resolves to the wrapped promise value', async () => {
		const pendingOps = new Set<Promise<unknown>>();
		await expect(trackOptimistic(pendingOps, Promise.resolve(42))).resolves.toBe(42);
	});
});

describe('cloneSessionForOptimism', () => {
	const source: SessionDetail = {
		id: 'session-1',
		dayNumber: 2,
		name: 'Upper A',
		exercises: [
			{ id: 'ex-1', activity: 'Bench Press', category: 'weight', note: '', plan: [5, 5, 5] }
		]
	};

	it('assigns a fresh temp id to the session and every exercise', () => {
		const clone = cloneSessionForOptimism(source);
		expect(clone.id).toMatch(/^temp-/);
		expect(clone.id).not.toBe(source.id);
		expect(clone.exercises[0].id).toMatch(/^temp-/);
		expect(clone.exercises[0].id).not.toBe(source.exercises[0].id);
	});

	it('defaults dayNumber to the source session, but accepts an override', () => {
		expect(cloneSessionForOptimism(source).dayNumber).toBe(2);
		expect(cloneSessionForOptimism(source, 5).dayNumber).toBe(5);
	});

	it('preserves the session name and copies exercise fields', () => {
		const clone = cloneSessionForOptimism(source);
		expect(clone.name).toBe('Upper A');
		expect(clone.exercises[0]).toMatchObject({
			activity: 'Bench Press',
			category: 'weight',
			note: '',
			plan: [5, 5, 5]
		});
	});

	it('deep-clones the plan array so mutating the clone leaves the source untouched', () => {
		const clone = cloneSessionForOptimism(source);
		clone.exercises[0].plan.push(3);
		expect(source.exercises[0].plan).toEqual([5, 5, 5]);
	});
});

describe('cloneWeekForOptimism', () => {
	const source: WeekDetail = {
		id: 'week-1',
		weekNumber: 3,
		sessions: [{ id: 'session-1', dayNumber: 1, name: 'Upper A', exercises: [] }]
	};

	it('assigns a fresh temp id and bumps weekNumber by one', () => {
		const clone = cloneWeekForOptimism(source);
		expect(clone.id).toMatch(/^temp-/);
		expect(clone.id).not.toBe(source.id);
		expect(clone.weekNumber).toBe(4);
	});

	it("clones every session with a fresh id, preserving each session's own dayNumber", () => {
		const clone = cloneWeekForOptimism(source);
		expect(clone.sessions).toHaveLength(1);
		expect(clone.sessions[0].id).toMatch(/^temp-/);
		expect(clone.sessions[0].id).not.toBe(source.sessions[0].id);
		expect(clone.sessions[0].dayNumber).toBe(1);
	});
});
