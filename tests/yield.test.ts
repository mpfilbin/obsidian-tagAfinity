import { describe, it, expect } from 'vitest';
import { yieldEvery } from '../src/yield';

describe('yieldEvery', () => {
	it('yields on every nth call only', async () => {
		let yields = 0;
		const tick = yieldEvery(3, () => {
			yields++;
			return Promise.resolve();
		});
		for (let i = 0; i < 7; i++) await tick();
		expect(yields).toBe(2);
	});
});
