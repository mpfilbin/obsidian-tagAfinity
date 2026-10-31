import { describe, it, expect } from 'vitest';
import { buildTree, collectTagStats } from '../../src/taxonomy/build';
import { renderTaxonomyMarkdown, isTaxonomyExport } from '../../src/taxonomy/export';
import { indexOf } from '../helpers';

const GENERATED_AT = new Date('2026-10-31T12:00:00.000Z');

function render(notes: Record<string, string[]>): string {
	const index = indexOf(Object.fromEntries(Object.entries(notes).map(([path, tags]) => [path, { vector: [1], tags }])));
	return renderTaxonomyMarkdown(buildTree(collectTagStats(index)), { generatedAt: GENERATED_AT });
}

const lines = (markdown: string): string[] => markdown.split('\n');

describe('renderTaxonomyMarkdown', () => {
	describe('front matter', () => {
		it('opens the file with a front matter fence', () => {
			expect(lines(render({ 'a.md': ['x'] }))[0]).toBe('---');
		});

		it('names the generator so the file can be recognised later', () => {
			expect(lines(render({ 'a.md': ['x'] }))).toContain('generator: Tagafinity');
		});

		it('declares the document type', () => {
			expect(lines(render({ 'a.md': ['x'] }))).toContain('type: tag-taxonomy');
		});

		it('records when it was generated', () => {
			expect(lines(render({ 'a.md': ['x'] }))).toContain('generated: 2026-10-31T12:00:00.000Z');
		});

		it('counts every tag path, including grouping tags', () => {
			expect(lines(render({ 'a.md': ['project/alpha'] }))).toContain('tag_count: 2');
		});

		it('counts each tagged note once however many tags it carries', () => {
			expect(lines(render({ 'a.md': ['x', 'y'], 'b.md': ['x'] }))).toContain('note_count: 2');
		});
	});

	describe('when the index has no tags', () => {
		it('says so instead of listing tags', () => {
			expect(lines(render({ 'a.md': [] }))).toContain('_No tags found in the index._');
		});

		it('declares zero tags', () => {
			expect(lines(render({ 'a.md': [] }))).toContain('tag_count: 0');
		});
	});

	describe('when tags exist', () => {
		it('explains how to read the hierarchy', () => {
			expect(lines(render({ 'a.md': ['x'] }))).toContain('## How to read this');
		});

		it('lists the taxonomy under its own heading', () => {
			expect(lines(render({ 'a.md': ['x'] }))).toContain('## Taxonomy');
		});

		describe('when a tag is used on several notes', () => {
			it('writes the tag without a leading hash and pluralises the count', () => {
				expect(lines(render({ 'a.md': ['x'], 'b.md': ['x'] }))).toContain('- `x` — 2 notes');
			});
		});

		describe('when a tag is used on one note', () => {
			it('uses the singular', () => {
				expect(lines(render({ 'a.md': ['x'] }))).toContain('- `x` — 1 note');
			});
		});

		describe('when tags are nested', () => {
			const markdown = render({ 'a.md': ['project'], 'b.md': ['project/alpha'], 'c.md': ['project/alpha'] });

			it('shows the total and the direct count on the parent', () => {
				expect(lines(markdown)).toContain('- `project` — 3 notes (1 direct)');
			});

			it('indents a child under its parent with its full path', () => {
				expect(lines(markdown)).toContain('  - `project/alpha` — 2 notes');
			});
		});

		describe('when a tag exists only as the prefix of nested tags', () => {
			it('marks it as grouping only', () => {
				expect(lines(render({ 'a.md': ['project/alpha'] }))).toContain('- `project` — 1 note (grouping only)');
			});
		});

		describe('when siblings are listed', () => {
			it('orders them by name so the file is stable between exports', () => {
				const all = lines(render({ 'a.md': ['zeta'], 'b.md': ['zeta'], 'c.md': ['alpha'] }));
				const tags = all.slice(all.indexOf('## Taxonomy') + 2).filter(Boolean);
				expect(tags.map((l) => l.slice(3, l.indexOf('`', 3)))).toEqual(['alpha', 'zeta']);
			});
		});
	});

	describe('line endings', () => {
		it('ends with a newline', () => {
			expect(render({ 'a.md': ['x'] }).endsWith('\n')).toBe(true);
		});

		it('does not end with a blank line', () => {
			expect(render({ 'a.md': ['x'] }).endsWith('\n\n')).toBe(false);
		});
	});
});

describe('isTaxonomyExport', () => {
	describe('when the text starts with our front matter', () => {
		it('recognises it', () => {
			expect(isTaxonomyExport(render({ 'a.md': ['x'] }))).toBe(true);
		});
	});

	describe('when the text is an ordinary note', () => {
		it('does not recognise it', () => {
			expect(isTaxonomyExport('# My diary\n\nDear diary')).toBe(false);
		});
	});

	describe('when the text only mentions the generator in its body', () => {
		it('does not recognise it', () => {
			expect(isTaxonomyExport('# Notes\n\ngenerator: Tagafinity\ntype: tag-taxonomy\n')).toBe(false);
		});
	});
});
