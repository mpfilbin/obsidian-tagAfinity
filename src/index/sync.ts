import type { EmbeddingProvider } from '../embeddings/provider';
import type { VaultGateway } from '../cli/gateway';
import { buildDocFrequencies } from '../text/keywords';
import { isExcluded } from './exclude';
import { proseOf } from '../text/tokenize';
import { extractTags } from '../tags/parse';
import type { IndexData, IndexedNote } from './store';
import { emptyIndex } from './store';

export interface SyncStats {
	added: number;
	updated: number;
	removed: number;
	unchanged: number;
}

export interface SyncOptions {
	gateway: VaultGateway;
	embedder: EmbeddingProvider;
	index: IndexData;
	/** Paths matching any of these patterns are not indexed. */
	exclude?: string[];
	concurrency?: number;
	batchSize?: number;
	onProgress?: (done: number, total: number, phase: 'reading' | 'embedding') => void;
	/**
	 * Called after every embedded batch with an index that is safe to persist: finished notes plus, for notes not
	 * reached yet, their previous entries. Lets an interrupted run resume instead of starting over.
	 */
	onCheckpoint?: (index: IndexData) => void | Promise<void>;
}

/** Embedded once before any work, purely to make sure the model loads. */
export const WARM_UP_TEXT = 'warm up';

export function hashContent(content: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < content.length; i++) {
		h ^= content.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16) + ':' + content.length;
}

export function embeddingText(path: string, content: string, maxChars = 2000): string {
	const title = path.replace(/^.*\//, '').replace(/\.md$/i, '');
	return `${title}. ${proseOf(content)}`.slice(0, maxChars);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, tick: () => void): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i]!);
			tick();
		}
	});
	await Promise.all(workers);
	return results;
}

/** Brings the index up to date with the vault, re-embedding only notes whose content changed. */
export async function syncIndex(options: SyncOptions): Promise<{ index: IndexData; stats: SyncStats }> {
	const { gateway, embedder, onProgress } = options;
	const concurrency = options.concurrency ?? 1;
	const batchSize = options.batchSize ?? 16;
	const previous = options.index.model === embedder.id ? options.index : emptyIndex(embedder.id);

	// Fail fast: loading the model is the step most likely to break, and reading every note first wastes minutes.
	await embedder.embed([WARM_UP_TEXT]);

	const exclude = options.exclude ?? [];
	const paths = (await gateway.listNotes()).filter((path) => !isExcluded(path, exclude));
	let read = 0;
	const contents = await mapPool(
		paths,
		concurrency,
		(path) => gateway.readNote(path),
		() => onProgress?.(++read, paths.length, 'reading'),
	);

	const notes: Record<string, IndexedNote> = {};
	const stats: SyncStats = { added: 0, updated: 0, removed: 0, unchanged: 0 };
	const pending: { path: string; hash: string; content: string }[] = [];

	paths.forEach((path, i) => {
		const content = contents[i]!;
		const hash = hashContent(content);
		const before = previous.notes[path];
		if (before && before.hash === hash) {
			notes[path] = { ...before, tags: extractTags(content).all };
			stats.unchanged++;
		} else {
			pending.push({ path, hash, content });
			if (before) stats.updated++;
			else stats.added++;
		}
	});
	stats.removed = Object.keys(previous.notes).filter((p) => !paths.includes(p)).length;

	let embedded = 0;
	for (let start = 0; start < pending.length; start += batchSize) {
		const batch = pending.slice(start, start + batchSize);
		const vectors = await embedder.embed(batch.map((n) => embeddingText(n.path, n.content)));
		batch.forEach((n, i) => {
			notes[n.path] = { hash: n.hash, vector: vectors[i]!, tags: extractTags(n.content).all };
		});
		embedded += batch.length;
		onProgress?.(embedded, pending.length, 'embedding');
		if (options.onCheckpoint) {
			const carried = Object.fromEntries(paths.flatMap((p) => (previous.notes[p] ? [[p, previous.notes[p]!]] : [])));
			await options.onCheckpoint({ ...previous, notes: { ...carried, ...notes } });
		}
	}

	const df = buildDocFrequencies(contents);
	return {
		index: { version: 1, model: embedder.id, notes, docCount: df.docCount, docFreq: df.docFreq },
		stats,
	};
}

/** After a tag-only edit the embedding is still valid; refresh just the hash and tags. */
export function refreshIndexEntry(index: IndexData, path: string, content: string): void {
	const entry = index.notes[path];
	if (entry) index.notes[path] = { ...entry, hash: hashContent(content), tags: extractTags(content).all };
}
