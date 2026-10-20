export interface IndexedNote {
	/** Obsidian's modification time and size when the note was indexed; used to detect changes without reading it. */
	mtime?: number;
	size?: number;
	hash: string;
	vector: number[];
	tags: string[];
}

export interface IndexData {
	version: 1;
	/** Identifies the embedding model so a model change forces a re-embed. */
	model: string;
	notes: Record<string, IndexedNote>;
	/** Epoch milliseconds of the last completed update. */
	syncedAt?: number;
	docCount: number;
	docFreq: Record<string, number>;
}

export function emptyIndex(model: string): IndexData {
	return { version: 1, model, notes: {}, docCount: 0, docFreq: {} };
}

export interface IndexStorage {
	read(): Promise<string | null>;
	write(data: string): Promise<void>;
}

export function serializeIndex(index: IndexData): string {
	return JSON.stringify(index, (key, value: unknown) =>
		key === 'vector' && Array.isArray(value) ? (value as number[]).map((v) => Math.round(v * 1e4) / 1e4) : value,
	);
}

/** Returns an empty index when the stored data is missing, corrupt, or built with another model. */
export function parseIndex(raw: string | null, model: string): IndexData {
	if (!raw) return emptyIndex(model);
	try {
		const parsed = JSON.parse(raw) as IndexData;
		if (parsed.version !== 1 || parsed.model !== model) return emptyIndex(model);
		return parsed;
	} catch {
		return emptyIndex(model);
	}
}

export async function loadIndex(storage: IndexStorage, model: string): Promise<IndexData> {
	return parseIndex(await storage.read(), model);
}

export async function saveIndex(storage: IndexStorage, index: IndexData): Promise<void> {
	await storage.write(serializeIndex(index));
}
