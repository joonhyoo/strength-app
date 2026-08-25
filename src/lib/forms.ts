import type { SubmitFunction } from '@sveltejs/kit';
import { goto } from '$app/navigation';

/**
 * `use:enhance` callback that follows an action redirect with `replaceState`.
 *
 * The default enhance pushes a history entry when an action redirects, which
 * hands the OS edge-swipe gesture something to pop. See the note in
 * src/app.html for why the stack is kept at depth 1.
 */
export function enhanceReplace(
	hooks: {
		onSubmit?: () => void;
		onDone?: () => void;
		onRedirect?: () => void;
		confirm?: () => boolean;
	} = {}
): SubmitFunction {
	return ({ cancel }) => {
		// A plain `onsubmit` handler calling event.preventDefault() does NOT
		// stop this action's own submit listener from also firing — enhance
		// intercepts the event independently and submits regardless of what
		// other listeners did. The only way to actually cancel an enhanced
		// submission is this callback's own `cancel()`, so a confirm() guard
		// has to live here, not in a sibling onsubmit prop.
		if (hooks.confirm && !hooks.confirm()) {
			cancel();
			return;
		}

		hooks.onSubmit?.();

		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				// A redirect means the action succeeded — e.g. a successful
				// OTP verify sending the user past /auth/login entirely.
				hooks.onRedirect?.();
				// result.location is a server-computed runtime string, not a
				// statically-known route literal, so resolve() has nothing to
				// check here.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				await goto(result.location, { replaceState: true, invalidateAll: true });
			} else {
				await update();
			}
			hooks.onDone?.();
		};
	};
}
