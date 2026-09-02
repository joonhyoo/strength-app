/** Resolves a coach-entered video link into something the athlete's exercise
 *  modal can play in place, never a link that navigates the athlete out of
 *  the app. YouTube/Vimeo pages get rewritten to their `iframe`-embeddable
 *  form; anything else is assumed to be a direct video file and handed to a
 *  native `<video>` element. */
export type VideoEmbed = { kind: 'iframe'; src: string } | { kind: 'video'; src: string };

export function resolveVideoEmbed(url: string | undefined | null): VideoEmbed | null {
	const trimmed = url?.trim();
	if (!trimmed) return null;

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

	const host = parsed.hostname.replace(/^www\.|^m\./, '');

	if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
		const id =
			parsed.searchParams.get('v') ??
			parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
		if (id) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}` };
	}

	if (host === 'youtu.be') {
		const id = parsed.pathname.slice(1);
		if (id) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}` };
	}

	if (host === 'vimeo.com') {
		const id = parsed.pathname.split('/').filter(Boolean).pop();
		if (id && /^\d+$/.test(id))
			return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}` };
	}

	// Anything else is treated as a direct video file link.
	return { kind: 'video', src: trimmed };
}
