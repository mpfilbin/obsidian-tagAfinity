import { describe, it, expect } from 'vitest';
import { filterNotePaths, findUntaggedNotes } from '../../src/taxonomy/untagged';
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

	describe('when more paths match than the limit', () => {
		it('stops at the limit', () => {
			expect(filterNotePaths(paths, 'md', 2)).toHaveLength(2);
		});
	});
});
