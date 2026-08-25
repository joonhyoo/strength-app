/**
 * Purges client-side caches that are scoped to the signed-in user, so a
 * shared/reused device never shows a previous user's data after logout.
 * Call on every logout — see AuthForm.svelte / CoachSidebar.svelte.
 */
export async function clearClientCaches() {
	if (typeof localStorage !== 'undefined') {
		for (const key of Object.keys(localStorage)) {
			if (
				key.startsWith('workout-day:') ||
				key.startsWith('status-map:') ||
				key.startsWith('auth-code-sent:') ||
				key === 'auth-pending-verify'
			) {
				localStorage.removeItem(key);
			}
		}
	}

	// Defense in depth: the service worker no longer caches session-scoped
	// responses at all (see src/service-worker.ts), so this isn't targeting
	// a known-bad entry — it's a blanket clear of every SW cache, including
	// the current one, in case a stale previous-version cache (from before
	// that fix) is still sitting on this device. Harmless either way: the
	// current cache holds only precached static assets, which the SW
	// simply re-adds from network on its next install.
	if (typeof caches !== 'undefined') {
		try {
			const keys = await caches.keys();
			await Promise.all(keys.map((key) => caches.delete(key)));
		} catch {
			// Cache API unavailable (private mode, unsupported) — nothing to do.
		}
	}
}
