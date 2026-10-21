import { log } from '../log';
import type { EmbeddingProvider } from './provider';
import { WorkerStartError } from './worker-provider';

/** Uses the primary provider; if it cannot start (not a model or inference error), switches to the fallback for good. */
export class FallbackEmbeddingProvider implements EmbeddingProvider {
	private fallback: EmbeddingProvider | null = null;

	constructor(
		private readonly primary: EmbeddingProvider & { batchSize?: number },
		private readonly makeFallback: () => EmbeddingProvider & { batchSize?: number },
	) {}

	get id(): string {
		return this.primary.id;
	}

	get batchSize(): number | undefined {
		return (this.fallback ?? this.primary).batchSize;
	}

	async embed(texts: string[]): Promise<number[][]> {
		if (!this.fallback) {
			try {
				return await this.primary.embed(texts);
			} catch (error) {
				if (!(error instanceof WorkerStartError)) throw error;
				log.info('embed', `background worker unavailable (${error.message}); computing embeddings on the main thread, which may slow Obsidian down`);
				this.primary.dispose?.();
				this.fallback = this.makeFallback();
			}
		}
		return this.fallback.embed(texts);
	}

	dispose(): void {
		this.primary.dispose?.();
		this.fallback?.dispose?.();
	}
}
