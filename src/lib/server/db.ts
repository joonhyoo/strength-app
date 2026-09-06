/**
 * Thin wrappers around a Supabase query so a failed query can never be mistaken
 * for "no rows".
 *
 * Every Supabase call in this codebase used to be `const { data } = await ...`,
 * discarding `error`. When PostgREST fails (RLS denial, bad embed, timeout,
 * connection blip) it returns `{ data: null, error }` — indistinguishable, to
 * the caller, from an empty table. These helpers split the two: a real error
 * throws `DbError` (logged, with the PG code) and propagates to a 500; a
 * genuinely-absent row comes back as `null` / `[]`.
 *
 * `label` is a stable dotted identifier for the call site, e.g.
 * `"program.loadTree"`, so one log line pins the exact query.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { serverLog, type Logger } from './log';

export class DbError extends Error {
	readonly label: string;
	readonly code?: string;
	readonly details?: string;
	readonly hint?: string;
	readonly status?: number;

	constructor(label: string, cause: PostgrestError, status?: number) {
		super(`${label}: ${cause.message}`);
		this.name = 'DbError';
		this.label = label;
		this.code = cause.code;
		this.details = cause.details;
		this.hint = cause.hint;
		this.status = status;
		this.cause = cause;
	}
}

/** The `{ data, error }` shape a Supabase builder resolves to. `D` is inferred
 *  straight from the builder — `X | null` for `.maybeSingle()`, `X[] | null`
 *  for a list select, `X | null` for `.single()`. */
type Resp<D> = { data: D; error: PostgrestError | null; status?: number };

/** `soft`: PG error codes the caller treats as an expected branch (e.g. a
 *  `23505` unique violation it turns into a 409). Those still throw a `DbError`
 *  so the caller can `catch` them, but aren't logged as a failure. */
type DbOpts = { soft?: readonly string[] };

async function unwrap<D>(
	log: Logger,
	label: string,
	q: PromiseLike<Resp<D>>,
	opts?: DbOpts
): Promise<D> {
	const { data, error, status } = await q;
	if (error) {
		const dbErr = new DbError(label, error, status);
		if (!opts?.soft?.includes(error.code)) log.error('db.query', dbErr, { label });
		throw dbErr;
	}
	return data;
}

/** `.maybeSingle()` — the resolved `null` means the row genuinely does not exist
 *  (a query error would have thrown). */
export function dbMaybe<D>(log: Logger, label: string, q: PromiseLike<Resp<D>>): Promise<D> {
	return unwrap(log, label, q);
}

/** `.single()` — throws if the row is missing as well as on a query error. */
async function dbSingle<D>(
	log: Logger,
	label: string,
	q: PromiseLike<Resp<D>>,
	opts?: DbOpts
): Promise<NonNullable<D>> {
	const data = await unwrap(log, label, q, opts);
	if (data == null) {
		const err = new Error(`${label}: expected exactly one row, got none`);
		log.error('db.missingRow', err, { label });
		throw err;
	}
	return data as NonNullable<D>;
}

/** Multi-row select — `[]` only ever means "the query succeeded and matched
 *  nothing", never "the query failed". */
export async function dbList<E>(
	log: Logger,
	label: string,
	q: PromiseLike<Resp<E[] | null>>
): Promise<E[]> {
	const data = await unwrap(log, label, q);
	return data ?? [];
}

/** insert / update / delete with no returned row needed. */
export async function dbWrite(
	log: Logger,
	label: string,
	q: PromiseLike<Resp<unknown>>,
	opts?: DbOpts
): Promise<void> {
	await unwrap(log, label, q, opts);
}

/** insert / update with `.select(...).single()` — returns the written row,
 *  throws if it comes back empty. */
export function dbWriteReturning<D>(
	log: Logger,
	label: string,
	q: PromiseLike<Resp<D>>,
	opts?: DbOpts
): Promise<NonNullable<D>> {
	return dbSingle(log, label, q, opts);
}

/**
 * For a **streamed** page-load promise (`load` returns `{ x: <this> }`, resolved
 * lazily on the client). Logs a query error loudly server-side, then resolves
 * `[]` anyway.
 *
 * Why not reject like `dbList`: the components that consume these
 * (`data.athletes.then(...)`, etc.) have no `.catch()` — a rejected streamed
 * promise strands them on a skeleton loader forever and only shows up as an
 * unhandled rejection in the browser console. Degrading to `[]` keeps the page
 * usable; the server log (with `label`) is where the failure is actually
 * actionable. An awaited (non-streamed) load should use `dbList` and let it
 * throw into `handleError`.
 */
export async function streamList<E>(label: string, q: PromiseLike<Resp<E[] | null>>): Promise<E[]> {
	try {
		return await dbList(serverLog, label, q);
	} catch {
		// dbList already emitted the error line with the PG code + label.
		return [];
	}
}
