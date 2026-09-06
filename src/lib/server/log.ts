/**
 * Structured server-side logging. Dependency-free: one JSON object per line to
 * stdout/stderr, which Vercel's function logs parse into filterable fields.
 *
 * The rule this enforces: nothing the server does fails silently. Every API
 * call emits exactly one `response` line (its access log — reqId, route,
 * action, userId, status, ms), every real query failure emits a `db.query`
 * line with the PG code + label, and audit-worthy mutations
 * (assign/shift/paste-week) emit their own line. See `db.ts` and
 * `apiHandler.ts`.
 *
 * `LOG_LEVEL` env (default `info`): set to `warn` in the platform once past
 * active debugging to drop the per-call access log while keeping every failure
 * and audit event; `error` to keep only failures.
 */
import { env } from '$env/dynamic/private';

type Fields = Record<string, unknown>;

const RANK = { info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof RANK;
const MIN_RANK = RANK[(env.LOG_LEVEL as Level) in RANK ? (env.LOG_LEVEL as Level) : 'info'];

/** Normalise anything thrown into a flat, JSON-safe shape. PostgrestError
 *  carries `code`/`details`/`hint` (the useful bits for a DB failure); a plain
 *  Error carries `stack`. `depth` bounds a pathological `cause` chain so the
 *  logger itself can never throw. */
function normaliseErr(err: unknown, depth = 0): Fields {
	if (err && typeof err === 'object') {
		const e = err as Record<string, unknown>;
		const out: Fields = {
			message: typeof e.message === 'string' ? e.message : String(err),
			name: typeof e.name === 'string' ? e.name : undefined
		};
		for (const k of ['code', 'details', 'hint', 'status', 'statusText', 'label'] as const) {
			if (e[k] !== undefined) out[k] = e[k];
		}
		if (typeof e.stack === 'string') out.stack = e.stack;
		if (depth < 3 && e.cause !== undefined && e.cause !== err) {
			out.cause = normaliseErr(e.cause, depth + 1);
		}
		return out;
	}
	return { message: String(err) };
}

function emit(level: Level, event: string, fields: Fields | undefined) {
	if (RANK[level] < MIN_RANK) return;
	const line: Fields = { ts: new Date().toISOString(), level, event, ...fields };
	// Single argument, pre-stringified: keeps the whole record on one line even
	// when a runtime would otherwise pretty-print or split an object arg.
	console[level === 'info' ? 'log' : level](JSON.stringify(line));
}

export interface Logger {
	info(event: string, fields?: Fields): void;
	warn(event: string, fields?: Fields): void;
	error(event: string, err: unknown, fields?: Fields): void;
}

function make(base: Fields): Logger {
	return {
		info: (event, fields) => emit('info', event, { ...base, ...fields }),
		warn: (event, fields) => emit('warn', event, { ...base, ...fields }),
		error: (event, err, fields) =>
			emit('error', event, { ...base, ...fields, err: normaliseErr(err) })
	};
}

/** Module-level logger for code paths with no request context (rare — most
 *  server code should thread a request logger from `apiHandler`). */
export const serverLog: Logger = make({});

/** A logger bound to one request's context — `{ reqId, route, action, userId }`,
 *  etc. Built once per request in `apiHandler` and passed down. */
export function requestLogger(base: Fields): Logger {
	return make(base);
}
