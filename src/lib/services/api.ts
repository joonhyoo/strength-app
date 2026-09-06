/**
 * The single client→server call path. Every `/api/*` request in the app goes
 * through here, so request shape, error semantics, and failure logging live in
 * one place — the client-side mirror of `src/lib/server/apiHandler.ts`.
 *
 * Two flavours, by how the caller wants a failure delivered:
 *
 *  - `postApi` — never rejects. A failed write (4xx, 5xx, malformed body, or
 *    offline) comes back as `{ ok: false }`. `error` is set only for a 4xx,
 *    where the server sends a user-actionable reason ("that day already has a
 *    session"); on a 5xx / network failure it's left undefined and the caller
 *    shows its own contextual "Could not X — reverted." text. Optimistic
 *    callers rely on this to know when to roll a local change back.
 *
 *  - `fetchApi` — rejects on anything but a 2xx. For reads where "no rows" and
 *    "the request failed" must not look alike (a real rest day vs. a dropped
 *    connection): the caller catches and shows a "couldn't load" state, leaving
 *    any cached data standing.
 *
 * Both log one `[api]` line to the browser console on failure; the server has
 * already logged the same call with its full context and a matching status.
 */

export type ApiResult = { ok: true; data: unknown } | { ok: false; error?: string };

function request(route: string, action: string, data: unknown): Promise<Response> {
	return fetch(route, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action, data })
	});
}

export async function postApi(route: string, action: string, data?: unknown): Promise<ApiResult> {
	try {
		const res = await request(route, action, data);
		if (res.ok) return { ok: true, data: (await res.json()).data };

		const body = await res.json().catch(() => null);
		console.error(`[api] POST ${route} ${action} → ${res.status}`, body);
		const error = res.status < 500 ? (body?.message as string | undefined) : undefined;
		return { ok: false, error };
	} catch (e) {
		// Offline, a dropped connection, or a malformed response — a failed write
		// either way, with no reason worth surfacing to the user.
		console.error(`[api] POST ${route} ${action} — request failed`, e);
		return { ok: false, error: undefined };
	}
}

export async function fetchApi<T>(route: string, action: string, data?: unknown): Promise<T> {
	const res = await request(route, action, data);
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		console.error(`[api] POST ${route} ${action} → ${res.status}`, body);
		throw new Error(`${action}: ${res.status} ${res.statusText}`);
	}
	return (await res.json()).data as T;
}
