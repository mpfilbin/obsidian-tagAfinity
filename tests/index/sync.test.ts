import { describe, it, expect } from 'vitest';
import type { EmbeddingProvider } from '../../src/embeddings/provider';
import { WARM_UP_TEXT, hashContent, syncIndex } from '../../src/index/sync';
import { emptyIndex, parseIndex, serializeIndex } from '../../src/index/store';
import { TAG_PARSER_VERSION } from '../../src/tags/parse';
import { FakeGateway } from '../helpers';

class CountingEmbedder implements EmbeddingProvider {
	id = 'fake';
	embedded = 0;
	embed(texts: string[]) {
		if (texts[0] !== WARM_UP_TEXT) this.embedded += texts.length;
		return Promise.resolve(texts.map(() => [1, 0]));
	}
}

describe('syncIndex', () => {
	describe('on first run', () => {
		it('embeds every note', async () => {
			const embedder = new CountingEmbedder();
			await syncIndex({ gateway: new FakeGateway({ 'a.md': 'one #x', 'b.md': 'two' }), embedder, index: emptyIndex('fake') });
			expect(embedder.embedded).toBe(2);
		});

		it('stores tags from content', async () => {
			const { index } = await syncIndex({ gateway: new FakeGateway({ 'a.md': 'one #x' }), embedder: new CountingEmbedder(), index: emptyIndex('fake') });
			expect(index.notes['a.md']!.tags).toEqual(['x']);
		});
	});

	describe('on a second run with one changed note', () => {
		it('re-embeds only the changed note', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one', 'b.md': 'two' });
			const embedder = new CountingEmbedder();
			const first = await syncIndex({ gateway, embedder, index: emptyIndex('fake') });
			gateway.files['b.md'] = 'two changed';
			embedder.embedded = 0;
			await syncIndex({ gateway, embedder, index: first.index });
			expect(embedder.embedded).toBe(1);
		});
	});

	describe('when a note is deleted', () => {
		it('drops it from the index', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one', 'b.md': 'two' });
			const first = await syncIndex({ gateway, embedder: new CountingEmbedder(), index: emptyIndex('fake') });
			delete gateway.files['b.md'];
			const second = await syncIndex({ gateway, embedder: new CountingEmbedder(), index: first.index });
			expect(Object.keys(second.index.notes)).toEqual(['a.md']);
		});
	});

	describe('when embedding takes several batches', () => {
		it('reports a checkpoint after every batch', async () => {
			const checkpoints: number[] = [];
			await syncIndex({
				gateway: new FakeGateway({ 'a.md': 'one', 'b.md': 'two', 'c.md': 'three' }),
				embedder: new CountingEmbedder(),
				index: emptyIndex('fake'),
				batchSize: 1,
				checkpointEvery: 1,
				onCheckpoint: (index) => void checkpoints.push(Object.keys(index.notes).length),
			});
			expect(checkpoints).toEqual([1, 2, 3]);
		});

		it('keeps notes from the previous index that are not processed yet', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one', 'b.md': 'two' });
			const first = await syncIndex({ gateway, embedder: new CountingEmbedder(), index: emptyIndex('fake') });
			gateway.files['a.md'] = 'one changed';
			gateway.files['b.md'] = 'two changed';
			let firstCheckpoint = 0;
			await syncIndex({
				gateway,
				embedder: new CountingEmbedder(),
				index: first.index,
				batchSize: 1,
				checkpointEvery: 1,
				onCheckpoint: (index) => {
					firstCheckpoint ||= Object.keys(index.notes).length;
				},
			});
			expect(firstCheckpoint).toBe(2);
		});
	});

	describe('progress reporting', () => {
		it('reports each phase in order', async () => {
			const phases: string[] = [];
			await syncIndex({
				gateway: new FakeGateway({ 'a.md': 'one', 'b.md': 'two' }),
				embedder: new CountingEmbedder(),
				index: emptyIndex('fake'),
				onProgress: (_done, _total, phase) => {
					if (phases[phases.length - 1] !== phase) phases.push(phase);
				},
			});
			expect(phases).toEqual(['preparing', 'reading', 'embedding', 'finishing']);
		});

		it('reports the total number of notes to read', async () => {
			const totals: number[] = [];
			await syncIndex({
				gateway: new FakeGateway({ 'a.md': 'one', 'b.md': 'two' }),
				embedder: new CountingEmbedder(),
				index: emptyIndex('fake'),
				onProgress: (_d, total, phase) => {
					if (phase === 'reading') totals.push(total);
				},
			});
			expect(totals[totals.length - 1]).toBe(2);
		});
	});

	describe('when checkpoints are throttled', () => {
		it('saves only every nth batch', async () => {
			const checkpoints: number[] = [];
			await syncIndex({
				gateway: new FakeGateway({ 'a.md': 'one', 'b.md': 'two', 'c.md': 'three', 'd.md': 'four' }),
				embedder: new CountingEmbedder(),
				index: emptyIndex('fake'),
				batchSize: 1,
				checkpointEvery: 2,
				onCheckpoint: (index) => void checkpoints.push(Object.keys(index.notes).length),
			});
			expect(checkpoints).toEqual([2, 4]);
		});
	});

	describe('when the embedder prefers a batch size', () => {
		it('uses it', async () => {
			const sizes: number[] = [];
			const embedder: EmbeddingProvider = {
				id: 'fake',
				batchSize: 2,
				embed: (texts) => {
					sizes.push(texts.length);
					return Promise.resolve(texts.map(() => [1, 0]));
				},
			};
			await syncIndex({ gateway: new FakeGateway({ 'a.md': 'one', 'b.md': 'two', 'c.md': 'three' }), embedder, index: emptyIndex('fake') });
			expect(sizes.filter((n) => n > 1)).toEqual([2]);
		});
	});

	describe('when the embedder cannot start', () => {
		it('fails before reading any notes', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one' });
			let reads = 0;
			const original = gateway.readNote.bind(gateway);
			gateway.readNote = (path: string) => {
				reads++;
				return original(path);
			};
			const broken: EmbeddingProvider = { id: 'fake', embed: () => Promise.reject(new Error('no model')) };
			await syncIndex({ gateway, embedder: broken, index: emptyIndex('fake') }).catch(() => undefined);
			expect(reads).toBe(0);
		});
	});

	describe('when a note matches an exclude pattern', () => {
		it('does not index it', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one', 'Map.excalidraw.md': 'compressed json' });
			const { index } = await syncIndex({ gateway, embedder: new CountingEmbedder(), index: emptyIndex('fake'), exclude: ['*.excalidraw.md'] });
			expect(Object.keys(index.notes)).toEqual(['a.md']);
		});
	});

	describe('when the embedding model changed', () => {
		it('re-embeds everything', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one' });
			const first = await syncIndex({ gateway, embedder: new CountingEmbedder(), index: emptyIndex('fake') });
			const other = new CountingEmbedder();
			other.id = 'other';
			await syncIndex({ gateway, embedder: other, index: first.index });
			expect(other.embedded).toBe(1);
		});
	});
});

const stat = (entries: Record<string, [number, number]>) => new Map(Object.entries(entries).map(([p, [mtime, size]]) => [p, { mtime, size }]));

describe('syncIndex with modification times', () => {
	const first = async (gateway: FakeGateway, stats: ReturnType<typeof stat>) =>
		syncIndex({ gateway, embedder: new CountingEmbedder(), index: emptyIndex('fake'), stats, now: () => 1000 });

	describe('when a note is unchanged since the last sync', () => {
		it('does not read it again', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one #x', 'b.md': 'two' });
			const stats = stat({ 'a.md': [1, 6], 'b.md': [1, 3] });
			const { index } = await first(gateway, stats);
			gateway.reads = [];
			await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats });
			expect(gateway.reads).toEqual([]);
		});

		it('keeps its tags', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one #x' });
			const stats = stat({ 'a.md': [1, 6] });
			const { index } = await first(gateway, stats);
			const second = await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats });
			expect(second.index.notes['a.md']!.tags).toEqual(['x']);
		});

		it('counts it as unchanged', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one' });
			const stats = stat({ 'a.md': [1, 3] });
			const { index } = await first(gateway, stats);
			expect((await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats })).stats.unchanged).toBe(1);
		});
	});

	describe('when a note was modified', () => {
		it('reads and re-embeds only that note', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one', 'b.md': 'two' });
			const { index } = await first(gateway, stat({ 'a.md': [1, 3], 'b.md': [1, 3] }));
			gateway.files['b.md'] = 'two changed';
			gateway.reads = [];
			const embedder = new CountingEmbedder();
			await syncIndex({ gateway, embedder, index, stats: stat({ 'a.md': [1, 3], 'b.md': [2, 11] }) });
			expect([gateway.reads, embedder.embedded]).toEqual([['b.md'], 1]);
		});
	});

	describe('when the modification time changed but the content did not', () => {
		it('does not re-embed and records the new time', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one' });
			const { index } = await first(gateway, stat({ 'a.md': [1, 3] }));
			const embedder = new CountingEmbedder();
			const second = await syncIndex({ gateway, embedder, index, stats: stat({ 'a.md': [5, 3] }) });
			expect([embedder.embedded, second.index.notes['a.md']!.mtime]).toEqual([0, 5]);
		});
	});

	describe('when a note is new', () => {
		it('reads and embeds it', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one' });
			const { index } = await first(gateway, stat({ 'a.md': [1, 3] }));
			gateway.files['b.md'] = 'brand new';
			gateway.reads = [];
			await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats: stat({ 'a.md': [1, 3], 'b.md': [2, 9] }) });
			expect(gateway.reads).toEqual(['b.md']);
		});
	});

	describe('when a note was deleted', () => {
		it('removes it without reading anything', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one', 'b.md': 'two' });
			const { index } = await first(gateway, stat({ 'a.md': [1, 3], 'b.md': [1, 3] }));
			delete gateway.files['b.md'];
			gateway.reads = [];
			const second = await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats: stat({ 'a.md': [1, 3] }) });
			expect([Object.keys(second.index.notes), gateway.reads]).toEqual([['a.md'], []]);
		});
	});

	describe('when a full rebuild is requested', () => {
		it('reads every note even if nothing changed', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one', 'b.md': 'two' });
			const stats = stat({ 'a.md': [1, 3], 'b.md': [1, 3] });
			const { index } = await first(gateway, stats);
			gateway.reads = [];
			await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats, full: true });
			expect(gateway.reads).toHaveLength(2);
		});
	});

	describe('when no modification times are available', () => {
		it('reads every note', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one' });
			const { index } = await syncIndex({ gateway, embedder: new CountingEmbedder(), index: emptyIndex('fake') });
			gateway.reads = [];
			await syncIndex({ gateway, embedder: new CountingEmbedder(), index });
			expect(gateway.reads).toEqual(['a.md']);
		});
	});

	describe('when the sync finishes', () => {
		it('records when it happened', async () => {
			const { index } = await first(new FakeGateway({ 'a.md': 'one' }), stat({ 'a.md': [1, 3] }));
			expect(index.syncedAt).toBe(1000);
		});
	});

	describe('term frequencies', () => {
		it('are kept when no note needed reading', async () => {
			const gateway = new FakeGateway({ 'a.md': 'sourdough starter', 'b.md': 'sourdough starter' });
			const stats = stat({ 'a.md': [1, 17], 'b.md': [1, 17] });
			const { index } = await first(gateway, stats);
			const second = await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats });
			expect(second.index.docFreq).toEqual(index.docFreq);
		});

		it('count the vault size of the new sync', async () => {
			const gateway = new FakeGateway({ 'a.md': 'one', 'b.md': 'two' });
			const { index } = await first(gateway, stat({ 'a.md': [1, 3], 'b.md': [1, 3] }));
			gateway.files['c.md'] = 'three';
			const second = await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats: stat({ 'a.md': [1, 3], 'b.md': [1, 3], 'c.md': [1, 5] }) });
			expect(second.index.docCount).toBe(3);
		});
	});
});

describe('syncIndex and the tag detection rules', () => {
	const stats = stat({ 'a.md': [1, 30] });
	const content = '<span style="color:#ff0000">x</span> #real';

	describe('when the index was built under older tag rules', () => {
		const older = async () => {
			const gateway = new FakeGateway({ 'a.md': content });
			const { index } = await syncIndex({ gateway, embedder: new CountingEmbedder(), index: emptyIndex('fake'), stats });
			// Pretend an older release built it: it saw the color as a tag and recorded no rules version.
			index.tagsVersion = undefined;
			index.notes['a.md']!.tags = ['ff0000', 'real'];
			return { gateway, index };
		};

		it('re-reads notes even though their modification times match', async () => {
			const { gateway, index } = await older();
			gateway.reads = [];
			await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats });
			expect(gateway.reads).toEqual(['a.md']);
		});

		it('corrects the stored tags', async () => {
			const { gateway, index } = await older();
			const next = await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats });
			expect(next.index.notes['a.md']!.tags).toEqual(['real']);
		});

		it('does not re-embed the unchanged notes', async () => {
			const { gateway, index } = await older();
			const embedder = new CountingEmbedder();
			await syncIndex({ gateway, embedder, index, stats });
			expect(embedder.embedded).toBe(0);
		});

		it('records the current rules version', async () => {
			const { gateway, index } = await older();
			const next = await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats });
			expect(next.index.tagsVersion).toBe(TAG_PARSER_VERSION);
		});
	});

	describe('when the index was built under the current tag rules', () => {
		it('still skips notes whose modification times match', async () => {
			const gateway = new FakeGateway({ 'a.md': content });
			const { index } = await syncIndex({ gateway, embedder: new CountingEmbedder(), index: emptyIndex('fake'), stats });
			gateway.reads = [];
			await syncIndex({ gateway, embedder: new CountingEmbedder(), index, stats });
			expect(gateway.reads).toEqual([]);
		});
	});
});

describe('index serialization', () => {
	it('round-trips', () => {
		const index = emptyIndex('m');
		expect(parseIndex(serializeIndex(index), 'm')).toEqual(index);
	});

	describe('when the stored model differs', () => {
		it('starts empty', () => {
			expect(parseIndex(serializeIndex(emptyIndex('old')), 'new').model).toBe('new');
		});
	});

	describe('when the data is corrupt', () => {
		it('starts empty', () => {
			expect(parseIndex('{not json', 'm')).toEqual(emptyIndex('m'));
		});
	});
});

describe('hashContent', () => {
	it('differs for different content', () => {
		expect(hashContent('a')).not.toBe(hashContent('b'));
	});
});
