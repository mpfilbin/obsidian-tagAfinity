import { describe, it, expect } from 'vitest';
import type { EmbeddingProvider } from '../../src/embeddings/provider';
import { hashContent, syncIndex } from '../../src/index/sync';
import { emptyIndex, parseIndex, serializeIndex } from '../../src/index/store';
import { FakeGateway } from '../helpers';

class CountingEmbedder implements EmbeddingProvider {
	id = 'fake';
	embedded = 0;
	embed(texts: string[]) {
		this.embedded += texts.length;
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
