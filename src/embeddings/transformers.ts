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
	private extractor: Promise<Extractor> | null = null;

	constructor(
		readonly id: string = DEFAULT_MODEL,
		private readonly onStatus?: (message: string) => void,
	) {}

	private load(): Promise<Extractor> {
		this.extractor ??= (async () => {
			this.onStatus?.('Loading embedding model…');
			const { pipeline, env } = await importAsWebRuntime(() => import('@huggingface/transformers'));
			env.allowLocalModels = false;
			env.useBrowserCache = true;
			const extractor = await pipeline('feature-extraction', this.id, { dtype: 'q8' });
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
		const output = await extractor(texts, { pooling: 'mean', normalize: true });
		return output.tolist();
	}

	dispose(): void {
		this.extractor = null;
	}
}
