import { describe, it, expect } from 'vitest';
import { writeTaxonomyExport } from '../../src/commands/export-taxonomy';
import { buildTree, collectTagStats } from '../../src/taxonomy/build';
import { renderTaxonomyMarkdown } from '../../src/taxonomy/export';
import { FakeGateway, indexOf } from '../helpers';

const tree = buildTree(collectTagStats(indexOf({ 'a.md': { vector: [1], tags: ['x'] } })));
const generatedAt = new Date('2026-10-31T12:00:00.000Z');
const rendered = renderTaxonomyMarkdown(tree, { generatedAt });

describe('writeTaxonomyExport', () => {
	describe('when the path is not a markdown file', () => {
		it('refuses', async () => {
			const result = await writeTaxonomyExport(new FakeGateway({}), 'Tag taxonomy.txt', tree, generatedAt);
			expect(result.status).toBe('refused');
		});

		it('writes nothing', async () => {
			const gateway = new FakeGateway({});
			await writeTaxonomyExport(gateway, 'Tag taxonomy.txt', tree, generatedAt);
			expect(gateway.creates).toEqual([]);
		});
	});

	describe('when the file does not exist yet', () => {
		it('reports it as created', async () => {
			const result = await writeTaxonomyExport(new FakeGateway({}), 'Tag taxonomy.md', tree, generatedAt);
			expect(result.status).toBe('created');
		});

		it('creates the file with the rendered taxonomy', async () => {
			const gateway = new FakeGateway({});
			await writeTaxonomyExport(gateway, 'Tag taxonomy.md', tree, generatedAt);
			expect(gateway.files['Tag taxonomy.md']).toBe(rendered);
		});
	});

	describe('when the file is an earlier export', () => {
		const earlier = renderTaxonomyMarkdown([], { generatedAt: new Date(0) });

		it('reports it as updated', async () => {
			const result = await writeTaxonomyExport(new FakeGateway({ 'Tag taxonomy.md': earlier }), 'Tag taxonomy.md', tree, generatedAt);
			expect(result.status).toBe('updated');
		});

		it('replaces its content', async () => {
			const gateway = new FakeGateway({ 'Tag taxonomy.md': earlier });
			await writeTaxonomyExport(gateway, 'Tag taxonomy.md', tree, generatedAt);
			expect(gateway.files['Tag taxonomy.md']).toBe(rendered);
		});
	});

	describe('when the file is an ordinary note', () => {
		it('refuses', async () => {
			const result = await writeTaxonomyExport(new FakeGateway({ 'Diary.md': 'Dear diary' }), 'Diary.md', tree, generatedAt);
			expect(result.status).toBe('refused');
		});

		it('leaves the note untouched', async () => {
			const gateway = new FakeGateway({ 'Diary.md': 'Dear diary' });
			await writeTaxonomyExport(gateway, 'Diary.md', tree, generatedAt);
			expect(gateway.files['Diary.md']).toBe('Dear diary');
		});
	});
});
