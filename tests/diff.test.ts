import { describe, it, expect } from 'vitest';
import { diffLines } from '../src/diff';

describe('diffLines', () => {
	describe('when texts are equal', () => {
		it('returns no changes', () => {
			expect(diffLines('a\nb', 'a\nb')).toEqual([]);
		});
	});

	describe('when a line is replaced', () => {
		it('reports a removal and an addition', () => {
			expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
				{ type: '-', line: 2, text: 'b' },
				{ type: '+', line: 2, text: 'x' },
			]);
		});
	});

	describe('when a line is removed', () => {
		it('reports only the removal', () => {
			expect(diffLines('a\nb\nc', 'a\nc')).toEqual([{ type: '-', line: 2, text: 'b' }]);
		});
	});
});
