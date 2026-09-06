import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			/** Set by `handleError` in hooks.server.ts — the same id is in the
			 *  server log line for that failure, so a user-reported error page
			 *  can be traced to its stack. */
			errorId?: string;
		}
		interface Locals {
			supabase: SupabaseClient<Database>;
			/** Verified JWT `sub`, set by hooks.server.ts for `/api/*` requests
			 *  (which it already gates on auth). Used for log context. */
			userId?: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
