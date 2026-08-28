/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// This file's mere presence is what makes SvelteKit auto-register it on
// every route (kit.serviceWorker.register defaults to true, never
// overridden in svelte.config.js) — no navigator.serviceWorker.register()
// call exists anywhere in src/, and none is needed.

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `strength-app-${version}`;

/** Build output is content-hashed and `files` are static — both are safe to cache-first. */
const PRECACHE = [...build, ...files];
const PRECACHE_SET = new Set(PRECACHE);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;

	// The Cache API only stores GET. Every mutation and every workout read goes
	// through `POST /api/workout`, so those are left entirely to the network —
	// day data is cached in the app layer instead (see workoutService).
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (!url.protocol.startsWith('http') || url.origin !== sw.location.origin) return;

	// Never serve an API response from the shell cache.
	if (url.pathname.startsWith('/api/')) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// Hashed build assets can never go stale, so skip the network entirely.
			if (PRECACHE_SET.has(url.pathname)) {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}

			// Everything else — every navigation and every SvelteKit __data.json
			// load payload — is session-scoped (rendered per-request from
			// hooks.server.ts's cookie-authenticated Supabase client, via
			// +layout.server.ts's profile fetch). Writing these into the shared
			// Cache API would let a later request on the same device replay a
			// previous user's authenticated shell, offline or post-logout, with
			// no cookie/session partitioning to stop it. So: network-only here,
			// never cached (not even on success) — only fall back to a match in
			// case a precache entry happens to exist at this exact URL.
			try {
				return await fetch(request);
			} catch (err) {
				const hit = await cache.match(request);
				if (hit) return hit;
				throw err;
			}
		})()
	);
});
