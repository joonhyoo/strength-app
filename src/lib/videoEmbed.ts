/** Resolves coach-entered video link into an embedded link that shows up
 *  on the athlete's exercise modal that can play in place. We avoid
 *  redirecting users. YouTube videos are the only supported format for
 *  now; everything else won't show anything. */
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
			parsed.searchParams.get('v') ?? parsed.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
		if (id) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}` };
	}

	if (host === 'youtu.be') {
		const id = parsed.pathname.slice(1);
		if (id) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}` };
	}

	return null;
}
