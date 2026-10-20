import { describe, it, expect } from 'vitest';
import { createWorkerHandler } from '../../src/embeddings/worker-core';
import type { WorkerResponse } from '../../src/embeddings/worker-protocol';

function setup(options: { failFirstLoad?: boolean; cacheAvailable?: boolean; env?: { allowLocalModels: boolean; useBrowserCache: boolean } } = {}) {
	const posted: WorkerResponse[] = [];
	let loads = 0;
	const env = options.env ?? { allowLocalModels: true, useBrowserCache: false };
	const handle = createWorkerHandler(
		() => {
			loads++;
			if (options.failFirstLoad && loads === 1) return Promise.reject(new Error('offline'));
			return Promise.resolve({
				env,
				pipeline: () => Promise.resolve((texts: string[]) => Promise.resolve({ tolist: () => texts.map(() => [1, 0]) })),
			});
		},
		(message) => posted.push(message),
		() => options.cacheAvailable ?? true,
	);
	return { handle, posted, loads: () => loads, env };
}

describe('createWorkerHandler', () => {
	describe('when asked to embed', () => {
		it('replies with one vector per text', async () => {
			const { handle, posted } = setup();
			await handle({ type: 'embed', id: 1, model: 'm', texts: ['a', 'b'] });
			expect(posted.find((m) => m.type === 'result')).toEqual({ type: 'result', id: 1, vectors: [[1, 0], [1, 0]] });
		});

		it('loads the model only once', async () => {
			const { handle, loads } = setup();
			await handle({ type: 'embed', id: 1, model: 'm', texts: ['a'] });
			await handle({ type: 'embed', id: 2, model: 'm', texts: ['b'] });
			expect(loads()).toBe(1);
		});
	});

	describe('when asked to initialise', () => {
		it('replies when the model is ready', async () => {
			const { handle, posted } = setup();
			await handle({ type: 'init', id: 7, model: 'm' });
			expect(posted.find((m) => m.type === 'ready')).toEqual({ type: 'ready', id: 7 });
		});
	});

	describe('when the Cache API is available', () => {
		it('caches downloaded model files', async () => {
			const { handle, env } = setup({ cacheAvailable: true });
			await handle({ type: 'init', id: 1, model: 'm' });
			expect(env.useBrowserCache).toBe(true);
		});
	});

	describe('when the Cache API is not available', () => {
		it('does not try to use it', async () => {
			const { handle, env } = setup({ cacheAvailable: false, env: { allowLocalModels: true, useBrowserCache: true } });
			await handle({ type: 'init', id: 1, model: 'm' });
			expect(env.useBrowserCache).toBe(false);
		});
	});

	describe('when loading fails', () => {
		it('replies with the error', async () => {
			const { handle, posted } = setup({ failFirstLoad: true });
			await handle({ type: 'embed', id: 1, model: 'm', texts: ['a'] });
			expect(posted.find((m) => m.type === 'error')).toEqual({ type: 'error', id: 1, message: 'offline' });
		});

		it('retries loading on the next request', async () => {
			const { handle, posted } = setup({ failFirstLoad: true });
			await handle({ type: 'embed', id: 1, model: 'm', texts: ['a'] });
			await handle({ type: 'embed', id: 2, model: 'm', texts: ['a'] });
			expect(posted.some((m) => m.type === 'result' && m.id === 2)).toBe(true);
		});
	});
});
