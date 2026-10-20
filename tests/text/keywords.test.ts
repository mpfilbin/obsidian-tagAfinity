import { describe, it, expect } from 'vitest';
import { buildDocFrequencies, buildDocFrequenciesAsync } from '../../src/text/keywords';

const contents = ['sourdough starter hydration', 'sourdough starter feeding', 'tax return filing'];

describe('buildDocFrequenciesAsync', () => {
	it('matches the synchronous result', async () => {
		expect(await buildDocFrequenciesAsync(contents, () => Promise.resolve())).toEqual(buildDocFrequencies(contents));
	});

	it('yields once per note', async () => {
		let ticks = 0;
		await buildDocFrequenciesAsync(contents, () => {
			ticks++;
			return Promise.resolve();
		});
		expect(ticks).toBe(3);
	});
});
