// A session-monotonic counter, not crypto.randomUUID(): these ids are only ever
// matched with `.startsWith('temp-')` or `===`, never parsed, they only need to
// be unique within one page load, and — unlike crypto.randomUUID() — this works
// outside a secure context (e.g. running the dev server over a LAN IP).
let tempSeq = 0;

/** A client-only placeholder id for a node inserted optimistically, ahead of
 *  the server's real id landing on reconcile. */
export function tempId(): string {
	return `temp-${++tempSeq}`;
}

/**
 * Tracks `op` in `pendingOps` until it settles. Callers that need to wait out
 * every in-flight optimistic write before reading shared state (e.g. before a
 * background refresh replaces it) can do `while (pendingOps.size > 0) await
 * Promise.allSettled([...pendingOps])`.
 */
export function trackOptimistic<T>(pendingOps: Set<Promise<unknown>>, op: Promise<T>): Promise<T> {
	pendingOps.add(op);
	// .then(onFulfilled, onRejected) rather than .finally(): a rejected `op`
	// makes .finally()'s own returned promise reject too, and with nothing to
	// observe that one, it surfaces as a separate unhandled rejection on top of
	// whatever the caller does with `op` itself.
	void op.then(
		() => pendingOps.delete(op),
		() => pendingOps.delete(op)
	);
	return op;
}
