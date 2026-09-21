/**
 * Serialises every server write so a write and its reload can never interleave
 * with another write. Each cursor writes through here end-to-end (server call +
 * reload-after), so two quick edits queue up instead of racing each other, and
 * a reload can't observe a half-applied sibling. The two coach state classes
 * expose `busy` (pending > 0) so submit buttons and drag-and-drop are disabled
 * while anything is in flight.
 */

let queue: Promise<void> = Promise.resolve();
// $state so `busy()` is reactive — template code (spinners, disabled buttons)
// re-renders when the queue drains, not just when the writes settle.
let pending = $state(0);

/** Runs `fn` after every earlier write has settled, resolving with its result.
 *  A rejection is contained per write: the next queued write still runs, and
 *  `idle()` doesn't throw. */
export function runWrite<T>(fn: () => Promise<T>): Promise<T> {
	pending++;
	const task = queue.then(async () => {
		try {
			return await fn();
		} finally {
			pending--;
		}
	});
	// The shared chain never rejects (a failed write's caller reads the error
	// from the `task` it got back); otherwise one bad write would strand the
	// queue forever.
	queue = task.then(
		() => undefined,
		() => undefined
	);
	return task;
}

/** Resolves once every queued write has settled. */
export async function writeQueueIdle(): Promise<void> {
	await queue;
}

/** True while a write is queued or running. */
export function writeQueueBusy(): boolean {
	return pending > 0;
}
