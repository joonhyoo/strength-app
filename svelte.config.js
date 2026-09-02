import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' }),
		// Inline the route CSS instead of emitting <link rel="stylesheet">. A
		// render-blocking stylesheet in <head> blocks the document's *first
		// paint* — so on a cold launch nothing painted, not the inline
		// <style>, not <html style="background-color:#0d0d0f">, not
		// #app-splash, until that file came back through a just-booted service
		// worker. Until then the web view is its own default white, and iOS
		// cross-dissolves the launch image into that: the ~8%-toward-white lift
		// for two frames at the launch handoff. Inlined, the first paint needs
		// nothing but the (precached) HTML document itself.
		// Threshold is a byte size; the root layout's CSS is ~95kB (~16kB gz).
		inlineStyleThreshold: 128 * 1024
	}
};

export default config;
