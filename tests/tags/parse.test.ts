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
