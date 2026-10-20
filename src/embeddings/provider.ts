export interface EmbeddingProvider {
	/** Stable identifier of the model; stored in the index. */
	readonly id: string;
	/** How many texts to embed per call; slower providers use fewer so each call is short. */
	readonly batchSize?: number;
	/** Returns one L2-normalized vector per input text. */
	embed(texts: string[]): Promise<number[][]>;
	dispose?(): void;
}
