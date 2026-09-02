// `/` is a prerendered sign-in shell: it renders identically for everyone (the
// static above-the-fold of /auth/login) and the real destination is chosen
// client-side from cookies (see +page.svelte and the inline bootstrap in
// src/app.html). Prerendering it is what lets the service worker precache it and
// paint a cold PWA launch with zero round-trips.
export const prerender = true;
