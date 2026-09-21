import { describe, it, expect } from 'vitest';
import { runWrite, writeQueueIdle, writeQueueBusy } from './writeQueue.svelte';

describe('writeQueue', () => {
	it('runs writes in order', async () => {
		const order: string[] = [];
		runWrite(async () => {
			await new Promise((r) => setTimeout(r, 5));
			order.push('first');
		});
		await runWrite(async () => {
			order.push('second');
		});
		expect(order).toEqual(['first', 'second']);
	});

	it("a rejection doesn't block the next write and idle() doesn't throw", async () => {
		const order: string[] = [];
		runWrite(async () => {
			order.push('first');
			throw new Error('boom');
		});
		const second = runWrite(async () => {
			order.push('second');
		});
		await expect(writeQueueIdle()).resolves.toBeUndefined();
		await second;
		expect(order).toEqual(['first', 'second']);
	});

	it('idle() waits for everything already queued', async () => {
		let done = false;
		runWrite(async () => {
			await new Promise((r) => setTimeout(r, 5));
			done = true;
		});
		expect(done).toBe(false);
		await writeQueueIdle();
		expect(done).toBe(true);
	});

	it('busy() is true while writes are pending and false once settled', async () => {
		runWrite(async () => {
			await new Promise((r) => setTimeout(r, 5));
		});
		expect(writeQueueBusy()).toBe(true);
		await writeQueueIdle();
		expect(writeQueueBusy()).toBe(false);
	});

	it('a write started after idle() still runs on the queue, not in parallel', async () => {
		const order: string[] = [];
		runWrite(async () => {
			await new Promise((r) => setTimeout(r, 5));
			order.push('a');
		});
		await runWrite(async () => {
			order.push('b');
		});
		// Now the queue is empty — the next write runs by itself, still ordered.
		await runWrite(async () => {
			order.push('c');
		});
		expect(order).toEqual(['a', 'b', 'c']);
	});
});
