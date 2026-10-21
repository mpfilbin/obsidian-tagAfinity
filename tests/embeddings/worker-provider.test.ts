import { describe, it, expect } from 'vitest';
import { FallbackEmbeddingProvider } from '../../src/embeddings/fallback';
import type { EmbeddingProvider } from '../../src/embeddings/provider';
import type { WorkerRequest, WorkerResponse } from '../../src/embeddings/worker-protocol';
import { WorkerEmbeddingProvider, WorkerStartError, type WorkerLike } from '../../src/embeddings/worker-provider';

class FakeWorker implements WorkerLike {
	sent: WorkerRequest[] = [];
	terminated = false;
	onmessage: WorkerLike['onmessage'] = null;
	onerror: WorkerLike['onerror'] = null;
	postMessage(message: WorkerRequest) {
		this.sent.push(message);
	}
	terminate() {
		this.terminated = true;
	}
	reply(message: WorkerResponse) {
		this.onmessage?.({ data: message });
	}
}

describe('WorkerEmbeddingProvider', () => {
	describe('when the worker answers', () => {
		it('resolves with the vectors', async () => {
			const worker = new FakeWorker();
			const provider = new WorkerEmbeddingProvider('m', () => worker);
			const result = provider.embed(['a']);
			worker.reply({ type: 'result', id: worker.sent[0]!.id, vectors: [[1, 0]] });
			expect(await result).toEqual([[1, 0]]);
		});

		it('asks for the configured model', async () => {
			const worker = new FakeWorker();
			const provider = new WorkerEmbeddingProvider('my-model', () => worker);
			void provider.embed(['a']);
			expect(worker.sent[0]).toMatchObject({ type: 'embed', model: 'my-model', texts: ['a'] });
		});

		it('matches concurrent answers to their requests', async () => {
			const worker = new FakeWorker();
			const provider = new WorkerEmbeddingProvider('m', () => worker);
			const first = provider.embed(['a']);
			const second = provider.embed(['b']);
			worker.reply({ type: 'result', id: worker.sent[1]!.id, vectors: [[2]] });
			worker.reply({ type: 'result', id: worker.sent[0]!.id, vectors: [[1]] });
			expect([await first, await second]).toEqual([[[1]], [[2]]]);
		});
	});

	describe('when the worker reports an error', () => {
		it('rejects with its message', async () => {
			const worker = new FakeWorker();
			const provider = new WorkerEmbeddingProvider('m', () => worker);
			const result = provider.embed(['a']);
			worker.reply({ type: 'error', id: worker.sent[0]!.id, message: 'model download failed' });
			await expect(result).rejects.toThrow('model download failed');
		});
	});

	describe('when the worker cannot be created', () => {
		it('rejects with a start error', async () => {
			const provider = new WorkerEmbeddingProvider('m', () => {
				throw new Error('blocked by policy');
			});
			await expect(provider.embed(['a'])).rejects.toBeInstanceOf(WorkerStartError);
		});
	});

	describe('when the worker script fails to load', () => {
		it('rejects pending requests with a start error', async () => {
			const worker = new FakeWorker();
			const provider = new WorkerEmbeddingProvider('m', () => worker);
			const result = provider.embed(['a']);
			worker.onerror?.({ message: 'script error' });
			await expect(result).rejects.toBeInstanceOf(WorkerStartError);
		});
	});

	describe('when there is nothing to embed', () => {
		it('does not start a worker', async () => {
			let created = 0;
			const provider = new WorkerEmbeddingProvider('m', () => {
				created++;
				return new FakeWorker();
			});
			await provider.embed([]);
			expect(created).toBe(0);
		});
	});

	describe('dispose', () => {
		it('terminates the worker', async () => {
			const worker = new FakeWorker();
			const provider = new WorkerEmbeddingProvider('m', () => worker);
			void provider.embed(['a']).catch(() => undefined);
			provider.dispose();
			expect(worker.terminated).toBe(true);
		});

		it('rejects requests still waiting', async () => {
			const worker = new FakeWorker();
			const provider = new WorkerEmbeddingProvider('m', () => worker);
			const result = provider.embed(['a']);
			provider.dispose();
			await expect(result).rejects.toThrow('stopped');
		});
	});
});

describe('FallbackEmbeddingProvider', () => {
	const ok = (vector: number[], batchSize?: number): EmbeddingProvider & { calls: number } => ({
		id: 'm',
		batchSize,
		calls: 0,
		embed(this: { calls: number }) {
			this.calls++;
			return Promise.resolve([vector]);
		},
	});
	const failing = (error: Error): EmbeddingProvider => ({ id: 'm', embed: () => Promise.reject(error) });

	describe('when the primary works', () => {
		it('uses it', async () => {
			const provider = new FallbackEmbeddingProvider(ok([1]), () => ok([2]));
			expect(await provider.embed(['a'])).toEqual([[1]]);
		});
	});

	describe('when the primary cannot start', () => {
		it('uses the fallback', async () => {
			const provider = new FallbackEmbeddingProvider(failing(new WorkerStartError('no workers')), () => ok([2]));
			expect(await provider.embed(['a'])).toEqual([[2]]);
		});

		it('reports the fallback batch size afterwards', async () => {
			const provider = new FallbackEmbeddingProvider(
				{ ...failing(new WorkerStartError('no workers')), batchSize: 16 },
				() => ok([2], 2),
			);
			await provider.embed(['a']);
			expect(provider.batchSize).toBe(2);
		});

		it('keeps using the fallback for later calls', async () => {
			const fallback = ok([2]);
			const provider = new FallbackEmbeddingProvider(failing(new WorkerStartError('no workers')), () => fallback);
			await provider.embed(['a']);
			await provider.embed(['b']);
			expect(fallback.calls).toBe(2);
		});
	});

	describe('when the primary fails for another reason', () => {
		it('does not fall back', async () => {
			const provider = new FallbackEmbeddingProvider(failing(new Error('model download failed')), () => ok([2]));
			await expect(provider.embed(['a'])).rejects.toThrow('model download failed');
		});
	});
});
