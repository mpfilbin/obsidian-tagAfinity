import { log } from '../log';
import { importAsWebRuntime } from './web-runtime';
import type { EmbeddingProvider } from './provider';

type Extractor = (
	texts: string[],
	options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

export const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * Local sentence embeddings via transformers.js. The model is downloaded once from the Hugging Face hub and
 * cached by the browser; after that all inference runs on-device and note content never leaves the machine.
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
	/** Inference blocks the UI on this path, so keep each call short. */
	readonly batchSize = 2;
	private extractor: Promise<Extractor> | null = null;

	constructor(
		readonly id: string = DEFAULT_MODEL,
		private readonly onStatus?: (message: string) => void,
	) {}

	private load(): Promise<Extractor> {
		this.extractor ??= (async () => {
			log.info('embed', `loading ${this.id} on the main thread`);
			this.onStatus?.('Loading embedding model…');
			const { pipeline, env } = await importAsWebRuntime(() => import('@huggingface/transformers'));
			env.allowLocalModels = false;
			env.useBrowserCache = typeof caches !== 'undefined';
			const extractor = await pipeline('feature-extraction', this.id, { dtype: 'q8' });
			log.info('embed', 'model ready (main thread)');
			this.onStatus?.('Embedding model ready');
			return extractor as unknown as Extractor;
		})().catch((error: unknown) => {
			this.extractor = null;
			throw error;
		});
		return this.extractor;
	}

	async embed(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) return [];
		const extractor = await this.load();
		return log.time('embed', `main-thread batch of ${texts.length}`, async () => {
			const output = await extractor(texts, { pooling: 'mean', normalize: true });
			return output.tolist();
		});
	}

	dispose(): void {
		this.extractor = null;
	}
}
