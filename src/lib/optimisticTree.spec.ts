import { describe, it, expect } from 'vitest';
import { tempId, trackOptimistic } from '$lib/optimisticTree';

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
