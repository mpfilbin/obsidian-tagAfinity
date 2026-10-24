import { describe, it, expect } from 'vitest';
import { describeUntaggedCount, filterNotePaths, findUntaggedNotes } from '../../src/taxonomy/untagged';
import { indexOf } from '../helpers';

describe('findUntaggedNotes', () => {
	describe('when some notes have no tags', () => {
		const index = indexOf({
			'b.md': { vector: [1, 0], tags: [] },
			'a.md': { vector: [1, 0], tags: [] },
			'c.md': { vector: [1, 0], tags: ['idea'] },
		});

		it('lists only those notes', () => {
			expect(findUntaggedNotes(index)).toEqual(['a.md', 'b.md']);
		});
	});

	describe('when every note has a tag', () => {
		it('returns nothing', () => {
			expect(findUntaggedNotes(indexOf({ 'a.md': { vector: [1, 0], tags: ['idea'] } }))).toEqual([]);
		});
	});

	describe('when the index is empty', () => {
		it('returns nothing', () => {
			expect(findUntaggedNotes(indexOf({}))).toEqual([]);
		});
	});

	describe('when notes are in nested folders', () => {
		it('sorts by full path', () => {
			const index = indexOf({
				'z/b.md': { vector: [1, 0], tags: [] },
				'a/c.md': { vector: [1, 0], tags: [] },
			});
			expect(findUntaggedNotes(index)).toEqual(['a/c.md', 'z/b.md']);
		});
	});
});

describe('filterNotePaths', () => {
	const paths = ['Projects/Alpha plan.md', 'Journal/2026-01-02.md', 'Projects/Beta.md'];

	describe('when the query is empty', () => {
		it('keeps every path', () => {
			expect(filterNotePaths(paths, '  ')).toEqual(paths);
		});
	});

	describe('when the query has several words', () => {
		it('keeps paths containing all of them, ignoring case', () => {
			expect(filterNotePaths(paths, 'projects ALPHA')).toEqual(['Projects/Alpha plan.md']);
		});
	});

	describe('when nothing matches', () => {
		it('returns nothing', () => {
			expect(filterNotePaths(paths, 'zebra')).toEqual([]);
		});
	});

	describe('when no limit is given', () => {
		it('returns every match', () => {
			expect(filterNotePaths(Array.from({ length: 300 }, (_, i) => `n${i}.md`), 'n')).toHaveLength(300);
		});
	});

	describe('when more paths match than the limit', () => {
		it('stops at the limit', () => {
			expect(filterNotePaths(paths, 'md', 2)).toHaveLength(2);
		});
	});
});

describe('describeUntaggedCount', () => {
	describe('when nothing is filtered', () => {
		describe('when there are several notes', () => {
			it('gives the total', () => {
				expect(describeUntaggedCount(300, 300, false)).toBe('300 notes without tags');
			});
		});

		describe('when there is one note', () => {
			it('uses the singular', () => {
				expect(describeUntaggedCount(1, 1, false)).toBe('1 note without tags');
			});
		});

		describe('when there are none', () => {
			it('says every note has a tag', () => {
				expect(describeUntaggedCount(0, 0, false)).toBe('Every indexed note has at least one tag');
			});
		});
	});

	describe('when a filter hides some notes', () => {
		it('gives shown and total', () => {
			expect(describeUntaggedCount(300, 12, false)).toBe('12 of 300 notes without tags');
		});
	});

	describe('when the index is behind the vault', () => {
		it('says the list may be out of date', () => {
			expect(describeUntaggedCount(300, 300, true)).toBe('300 notes without tags (the index is behind the vault: update it for an exact list)');
		});
	});
});
