import { describe, it, expect } from 'vitest';
import { describeProgress, progressFraction } from '../../src/index/progress';

describe('describeProgress', () => {
	it('names the model loading step', () => {
		expect(describeProgress({ phase: 'preparing', done: 0, total: 0 })).toBe('Loading the embedding model…');
	});

	it('shows how many changed notes have been read', () => {
		expect(describeProgress({ phase: 'reading', done: 12, total: 40 })).toBe('Reading changed notes: 12 of 40…');
	});

	describe('when nothing needs reading', () => {
		it('says it is checking', () => {
			expect(describeProgress({ phase: 'reading', done: 0, total: 0 })).toBe('Checking for changed notes…');
		});
	});

	it('shows how many notes have been embedded', () => {
		expect(describeProgress({ phase: 'embedding', done: 3, total: 12 })).toBe('Embedding notes: 3 of 12…');
	});

	it('names the finishing step', () => {
		expect(describeProgress({ phase: 'finishing', done: 0, total: 0 })).toBe('Finishing up…');
	});
});

describe('progressFraction', () => {
	it('is the completed share of the current step', () => {
		expect(progressFraction({ phase: 'embedding', done: 3, total: 12 })).toBe(0.25);
	});

	describe('when the step has no known size', () => {
		it('is undefined, meaning indeterminate', () => {
			expect(progressFraction({ phase: 'preparing', done: 0, total: 0 })).toBeUndefined();
		});
	});

	it('never exceeds one', () => {
		expect(progressFraction({ phase: 'reading', done: 5, total: 4 })).toBe(1);
	});
});
