import { describe, it, expect } from 'vitest';
import { resolveDrop } from '../../src/cleanup/drop';

describe('resolveDrop', () => {
	describe('when a tag is dropped on another tag', () => {
		it('stages a move under it', () => {
			const result = resolveDrop('bread', 'cooking', false);
			expect(result.ok && result.action.description).toBe('Move #bread under #cooking');
		});
	});

	describe('when the merge modifier is held', () => {
		it('stages a merge into the target instead', () => {
			const result = resolveDrop('ml', 'machine-learning', true);
			expect(result.ok && result.action.description).toBe('Merge #ml into #machine-learning');
		});
	});

	describe('when a nested tag is dropped on the top-level zone', () => {
		it('stages a move to the top level', () => {
			const result = resolveDrop('cooking/bread', null, false);
			expect(result.ok && result.action.description).toBe('Move #cooking/bread to the top level');
		});
	});

	describe('when a top-level tag is dropped on the top-level zone', () => {
		it('is rejected because it is already there', () => {
			expect(resolveDrop('bread', null, false)).toEqual({ ok: false, error: expect.stringMatching(/already/i) });
		});
	});

	describe('when merging into the top-level zone', () => {
		it('is rejected, because a merge needs a target tag', () => {
			expect(resolveDrop('a/b', null, true)).toEqual({ ok: false, error: expect.stringMatching(/target/i) });
		});
	});

	describe('when a tag is dropped on itself', () => {
		it('is rejected', () => {
			expect(resolveDrop('a', 'a', false)).toEqual({ ok: false, error: expect.stringMatching(/inside itself/i) });
		});
	});

	describe('when a tag is dropped on one of its own descendants', () => {
		it('is rejected', () => {
			expect(resolveDrop('a', 'a/b/c', false)).toEqual({ ok: false, error: expect.stringMatching(/inside itself/i) });
		});
	});

	describe('when a tag is dropped on its current parent', () => {
		it('is rejected because it is already there', () => {
			expect(resolveDrop('cooking/bread', 'cooking', false)).toEqual({ ok: false, error: expect.stringMatching(/already/i) });
		});
	});

	describe('when merging a tag into itself', () => {
		it('is rejected', () => {
			expect(resolveDrop('a', 'a', true)).toEqual({ ok: false, error: expect.stringMatching(/itself/i) });
		});
	});
});
