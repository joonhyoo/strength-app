import { describe, it, expect } from 'vitest';
import { resolveVideoEmbed } from '$lib/videoEmbed';

describe('resolveVideoEmbed', () => {
	it('rewrites a youtube watch url to an embeddable nocookie url', () => {
		expect(resolveVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
			kind: 'iframe',
			src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
		});
	});

	it('rewrites a youtube share url to an embeddable nocookie url', () => {
		expect(resolveVideoEmbed('https://youtu.be/dQw4w9WgXcQ?si=Rx8Ig8WZ0m4Z93jA')).toEqual({
			kind: 'iframe',
			src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
		});
	});

	it('rewrites a youtube embed url to an embeddable nocookie url', () => {
		expect(resolveVideoEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ?si=TJcHJrkXHlEOE092')).toEqual({
			kind: 'iframe',
			src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
		});
	});

	it('rewrites a youtube shorts url to an embeddable nocookie url', () => {
		expect(resolveVideoEmbed('https://youtube.com/shorts/SK-ev8_x0KA?si=efv45TqfVxhiTi5M')).toEqual({
			kind: 'iframe',
			src: 'https://www.youtube-nocookie.com/embed/SK-ev8_x0KA'
		});
	});

	it('returns null for a non-http(s) url, never handing back a link that could navigate away', () => {
		expect(resolveVideoEmbed('javascript:alert(1)')).toBeNull();
	});
  
	it('returns null for a blank youtube url', () => {
		expect(resolveVideoEmbed('https://www.youtube.com')).toBeNull();
	});

	it('returns null for a blank youtube share url', () => {
		expect(resolveVideoEmbed('https://www.youtu.be')).toBeNull();
	});

	it('returns null for an empty string input', () => {
		expect(resolveVideoEmbed('')).toBeNull();
	});
});
