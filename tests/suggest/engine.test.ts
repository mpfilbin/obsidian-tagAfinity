import { describe, it, expect } from 'vitest';
import { suggestTags } from '../../src/suggest/engine';
import { normalize } from '../../src/vector';
import { indexOf } from '../helpers';

const index = indexOf({
	'a.md': { vector: [1, 0.1, 0], tags: ['ml', 'python'] },
	'b.md': { vector: [1, 0.2, 0], tags: ['ml', 'research'] },
	'c.md': { vector: [0.9, 0.1, 0.1], tags: ['ml'] },
	'd.md': { vector: [0, 0, 1], tags: ['cooking'] },
});
const base = { queryPath: 'q.md', queryVector: normalize([1, 0.15, 0]), queryContent: '', currentTags: [] as string[], index };

describe('suggestTags', () => {
	describe('when neighbours agree on a tag', () => {
		it('ranks it first', () => {
			expect(suggestTags(base)[0]!.tag).toBe('ml');
		});
	});

	describe('when a tag belongs only to dissimilar notes', () => {
		it('does not suggest it', () => {
			expect(suggestTags(base).map((s) => s.tag)).not.toContain('cooking');
		});
	});

	describe('when the note already has the tag', () => {
		it('does not suggest it again', () => {
			expect(suggestTags({ ...base, currentTags: ['ML'] }).map((s) => s.tag)).not.toContain('ml');
		});
	});

	describe('when the query is the indexed note itself', () => {
		it('excludes the note from its own neighbours', () => {
			const result = suggestTags({ ...base, queryPath: 'a.md', currentTags: [], options: { minScore: 0 } });
			expect(result.flatMap((s) => s.evidence.map((e) => e.path))).not.toContain('a.md');
		});
	});

	describe('when evidence is attached', () => {
		it('lists the supporting neighbours', () => {
			expect(suggestTags(base)[0]!.evidence.length).toBeGreaterThan(0);
		});
	});

	describe('when too few existing tags qualify', () => {
		const content = 'sourdough starter hydration. sourdough starter feeding. sourdough starter ratio.';

		it('proposes a new tag from note keywords', () => {
			const result = suggestTags({ ...base, queryVector: normalize([0, 1, 0]), queryContent: content });
			expect(result.find((s) => s.isNew)?.tag).toBeTruthy();
		});

		it('marks keyword-derived tags as new', () => {
			const result = suggestTags({ ...base, queryVector: normalize([0, 1, 0]), queryContent: content });
			expect(result.every((s) => s.isNew)).toBe(true);
		});
	});

	describe('when a keyword matches an existing vault tag', () => {
		it('suggests the existing tag instead of a new one', () => {
			const content = 'python python python scripting scripting.';
			const result = suggestTags({ ...base, queryVector: normalize([0, 1, 0]), queryContent: content });
			expect(result.find((s) => s.tag === 'python')?.isNew).toBe(false);
		});
	});
});
