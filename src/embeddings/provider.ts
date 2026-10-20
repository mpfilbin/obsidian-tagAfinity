export interface EmbeddingProvider {
	/** Stable identifier of the model; stored in the index. */
	readonly id: string;
	/** Returns one L2-normalized vector per input text. */
	embed(texts: string[]): Promise<number[][]>;
	dispose?(): void;
}
