import { describe, it, expect } from 'vitest';
import { extractTags, findInlineTags } from '../../src/tags/parse';

describe('findInlineTags', () => {
	describe('when text has a plain tag', () => {
		it('returns the tag without the hash', () => {
			expect(findInlineTags('hello #project/alpha world').map((m) => m.tag)).toEqual(['project/alpha']);
		});
	});

	describe('when the hash is followed only by digits', () => {
		it('does not treat it as a tag', () => {
			expect(findInlineTags('issue #123 is open')).toEqual([]);
		});
	});

	describe('when the tag is inside a code fence', () => {
		it('ignores it', () => {
			expect(findInlineTags('```\n#notatag\n```')).toEqual([]);
		});
	});

	describe('when the tag is inside inline code', () => {
		it('ignores it', () => {
			expect(findInlineTags('use `#notatag` here')).toEqual([]);
		});
	});

	describe('when the hash begins a heading', () => {
		it('ignores it', () => {
			expect(findInlineTags('# Heading\n## Another')).toEqual([]);
		});
	});

	describe('when the hash is a wikilink heading anchor', () => {
		it('ignores it', () => {
			expect(findInlineTags('see [[#Heading]] and [[note#part]]')).toEqual([]);
		});
	});

	describe('when the hash is a URL fragment', () => {
		it('ignores it', () => {
			expect(findInlineTags('visit https://x.com/page#section now')).toEqual([]);
		});
	});

	describe('when the tag has trailing punctuation', () => {
		it('stops at the punctuation', () => {
			expect(findInlineTags('this is #cool, right').map((m) => m.tag)).toEqual(['cool']);
		});
	});
});

describe('findInlineTags in HTML, SVG and links', () => {
	const tags = (text: string) => findInlineTags(text).map((m) => m.tag);

	describe('when a hash is an HTML color in an attribute', () => {
		it('is not a tag', () => {
			expect(tags('<span style="color:#ff0000">warning</span>')).toEqual([]);
		});
	});

	describe('when a hash is an anchor in an HTML attribute', () => {
		it('is not a tag', () => {
			expect(tags('<a href="#section">jump</a>')).toEqual([]);
		});
	});

	describe('when a hash is inside an SVG element', () => {
		it('is not a tag', () => {
			expect(tags('<svg viewBox="0 0 10 10"><path fill="#abc"/><text>#label</text></svg>')).toEqual([]);
		});
	});

	describe('when an SVG spans several lines', () => {
		it('ignores every hash in it', () => {
			expect(tags('<svg>\n<g marker-end="url(#arrow)">\n<text>#inside</text>\n</g>\n</svg>')).toEqual([]);
		});
	});

	describe('when a hash references an SVG id', () => {
		it('is not a tag', () => {
			expect(tags('<g marker-end="url(#_r_q__flowchart-v2-pointEnd)"></g>')).toEqual([]);
		});
	});

	describe('when a style block has selectors and colors', () => {
		it('ignores them', () => {
			expect(tags('<style>\n#header { color: #333 }\n</style>')).toEqual([]);
		});
	});

	describe('when a script block has hashes', () => {
		it('ignores them', () => {
			expect(tags('<script>const color = "#ff0000"; // #todo</script>')).toEqual([]);
		});
	});

	describe('when a hash is inside an HTML comment', () => {
		it('is not a tag', () => {
			expect(tags('<!-- #todo later -->')).toEqual([]);
		});
	});

	describe('when a real tag follows HTML on the same line', () => {
		it('is still found', () => {
			expect(tags('<b>bold</b> #real')).toEqual(['real']);
		});
	});

	describe('when a tag is in the text of an ordinary HTML element', () => {
		it('is still found', () => {
			expect(tags('<p>some text #real</p>')).toEqual(['real']);
		});
	});

	describe('when a less-than sign is just punctuation', () => {
		it('does not hide the tags after it', () => {
			expect(tags('if a < b then #real')).toEqual(['real']);
		});
	});

	describe('when a Markdown link points at an anchor', () => {
		it('is not a tag', () => {
			expect(tags('[see this](page.md#section)')).toEqual([]);
		});
	});

	describe('when a Markdown link URL contains parentheses', () => {
		it('ignores the fragment after them', () => {
			expect(tags('[^](https://en.wikipedia.org/wiki/Covariance_(computer_science)#cite_ref-28 "Jump up")')).toEqual([]);
		});
	});

	describe('when a bare URL contains parentheses', () => {
		it('ignores the fragment after them', () => {
			expect(tags('see https://en.wikipedia.org/wiki/Covariance_(computer_science)#cite_ref-28 now')).toEqual([]);
		});
	});

	describe('when a Markdown link target is wrapped in angle brackets', () => {
		it('is not a tag', () => {
			expect(tags('[see this](<my page.md#section>)')).toEqual([]);
		});
	});

	describe('when the link text itself contains a tag', () => {
		it('is still found', () => {
			expect(tags('[#real](https://example.com)')).toEqual(['real']);
		});
	});

	describe('when an autolink has a fragment', () => {
		it('is not a tag', () => {
			expect(tags('<https://example.com/#frag>')).toEqual([]);
		});
	});

	describe('when a bare URL has a fragment', () => {
		it('is not a tag', () => {
			expect(tags('read https://example.com/page?a=1#frag today')).toEqual([]);
		});
	});

	describe('when a bare www URL has a fragment', () => {
		it('is not a tag', () => {
			expect(tags('read www.example.com/#frag today')).toEqual([]);
		});
	});

	describe('when a reference-style link definition has an anchor', () => {
		it('is not a tag', () => {
			expect(tags('[ref]: https://example.com/#frag "Title"')).toEqual([]);
		});
	});

	describe('when a reference-style link points at a heading anchor', () => {
		it('is not a tag', () => {
			expect(tags('[ref]: #heading')).toEqual([]);
		});
	});

	describe('when a footnote definition contains a tag', () => {
		it('is still found, since a footnote is not a link definition', () => {
			expect(tags('[^1]: a note about #real things')).toEqual(['real']);
		});
	});

	describe('when a tag follows a URL on the same line', () => {
		it('is still found', () => {
			expect(tags('see https://example.com/page then #real')).toEqual(['real']);
		});
	});

	describe('when an HTML entity looks like a hash reference', () => {
		it('is not a tag', () => {
			expect(tags('it&#39;s &#x1F600; fine')).toEqual([]);
		});
	});
});

describe('extractTags', () => {
	describe('when frontmatter uses a block list', () => {
		it('reads each item', () => {
			expect(extractTags('---\ntags:\n  - a\n  - b\n---\nbody').frontmatter).toEqual(['a', 'b']);
		});
	});

	describe('when frontmatter uses a flow list', () => {
		it('reads each item', () => {
			expect(extractTags('---\ntags: [a, "b"]\n---\nbody').frontmatter).toEqual(['a', 'b']);
		});
	});

	describe('when frontmatter uses a comma string', () => {
		it('reads each item', () => {
			expect(extractTags('---\ntags: a, b\n---\n').frontmatter).toEqual(['a', 'b']);
		});
	});

	describe('when a tag appears in frontmatter and inline with different case', () => {
		it('lists it once in all', () => {
			expect(extractTags('---\ntags: [Foo]\n---\ntext #foo').all).toEqual(['Foo']);
		});
	});

	describe('when the note has no frontmatter', () => {
		it('reads inline tags', () => {
			expect(extractTags('just #one').all).toEqual(['one']);
		});
	});
});
