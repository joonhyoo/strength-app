// `/` is a static splash shell: it renders identically for everyone and the
// real destination is chosen client-side from cookies (see +page.svelte).
// #app-splash (src/app.html) covers it the whole time. Prerendering it is what
// lets the service worker precache it and paint a cold PWA launch with zero
// round-trips.
export const prerender = true;
