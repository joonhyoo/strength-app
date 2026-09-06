/**
 * Wraps an `/api/*` POST handler so that:
 *   - every call emits exactly one `response` line (the access log: reqId,
 *     route, action, userId, status, ms) — `info` for 2xx/4xx, `error` for 5xx,
 *   - a thrown `error(4xx)` (validation / not-found / conflict) passes through
 *     unchanged, its status on that one line,
 *   - anything else — a `DbError`, a bug, a rejected promise — is turned into a
 *     clean `500` so the client never renders a wrong "empty" state over a real
 *     failure (its root cause was already logged at its source).
 *
 * Handlers receive `{ action, data, supabase, userId, log, event }` and return
 * `json(...)` as before. `userId` is read from the verified JWT purely for log
 * context; `hooks.server.ts` already gates `/api/*` auth.
 */
import { error, isHttpError, isRedirect, json, type RequestHandler } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../database.types';
import { requestLogger, type Logger } from './log';

/**
 * A parsed JSON request body's `data` object. Deliberately loose: a JSON body
 * is untyped by nature and each switch handler already knows the shape its own
 * action sends. This mirrors the pre-wrapper code, where `data` came off an
 * untyped `await request.json()`. Runtime safety comes from the DB layer and
 * RLS, not from trusting this shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiData = Record<string, any>;

export interface ApiContext {
	action: string;
	data: ApiData;
	/** Schema-typed, like `event.locals.supabase` — column names in the switch
	 *  handlers stay checked against `database.types.ts`. */
	supabase: SupabaseClient<Database>;
	/** From the verified JWT; `null` only if the token has no `sub`. */
	userId: string | null;
	log: Logger;
	event: RequestEvent;
}

export function postHandler(
	route: string,
	run: (ctx: ApiContext) => Promise<Response>
): RequestHandler {
	return async (event) => {
		const { supabase } = event.locals;
		const reqId = crypto.randomUUID();

		let body: { action?: unknown; data?: unknown };
		try {
			body = await event.request.json();
		} catch {
			requestLogger({ reqId, route }).warn('request.badBody');
			return error(400, 'Malformed request body.');
		}

		const action = typeof body.action === 'string' ? body.action : '(none)';
		const data: ApiData = body.data && typeof body.data === 'object' ? (body.data as ApiData) : {};

		// hooks.server.ts already verified the JWT and stashed `sub` for /api/*.
		const userId = event.locals.userId ?? null;

		const log = requestLogger({ reqId, route, action, userId });
		const started = Date.now();

		// Exactly one line per call — the access log. `info` for anything the
		// caller could reasonably cause (2xx, and 4xx validation / not-found /
		// conflict); `error` only for a 5xx, whose root cause was already logged
		// at its source (a `db.query` line, or the handler's own `error(500,…)`).
		try {
			const res = await run({ action, data, supabase, userId, log, event });
			log.info('response', { status: res.status, ms: Date.now() - started });
			return res;
		} catch (e) {
			if (isRedirect(e)) throw e;
			const ms = Date.now() - started;
			if (isHttpError(e)) {
				if (e.status >= 500) log.error('response', e, { status: e.status, ms });
				else log.info('response', { status: e.status, ms, body: e.body });
				throw e;
			}
			log.error('response', e, { status: 500, ms });
			return error(500, 'Something went wrong.');
		}
	};
}

export { json };
