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

describe('diffLines on large notes', () => {
	const big = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n');

	describe('when one line of a very long note changes', () => {
		it('finishes quickly', () => {
			const before = big(20000);
			const started = Date.now();
			diffLines(before, before.replace('line 10000\n', 'line 10000 #x\n'));
			expect(Date.now() - started).toBeLessThan(500);
		});

		it('still reports the changed line', () => {
			const before = big(20000);
			expect(diffLines(before, before.replace('line 10000\n', 'line 10000 #x\n'))).toEqual([
				{ type: '-', line: 10001, text: 'line 10000' },
				{ type: '+', line: 10001, text: 'line 10000 #x' },
			]);
		});
	});

	describe('when a line is added at the end', () => {
		it('reports only the addition', () => {
			expect(diffLines('a\nb', 'a\nb\nc')).toEqual([{ type: '+', line: 3, text: 'c' }]);
		});
	});

	describe('when the differing region is too large to compare line by line', () => {
		it('falls back to reporting the whole region as replaced', () => {
			const changes = diffLines(big(3000), big(3000).replace(/line/g, 'row'));
			expect(changes).toHaveLength(6000);
		});
	});
});
