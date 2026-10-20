import { describe, it, expect } from 'vitest';
import { buildTaxonomy, buildTaxonomyAsync, buildTree, collectTagStats } from '../../src/taxonomy/build';
import { indexOf } from '../helpers';

describe('collectTagStats', () => {
	it('merges casing variants using the most common one', () => {
		const stats = collectTagStats(
			indexOf({
				'a.md': { vector: [1, 0], tags: ['Foo'] },
				'b.md': { vector: [1, 0], tags: ['Foo'] },
				'c.md': { vector: [1, 0], tags: ['foo'] },
			}),
		);
		expect(stats.map((s) => [s.tag, s.count])).toEqual([['Foo', 3]]);
	});
});

describe('buildTree', () => {
	it('nests tags by slash', () => {
		const tree = buildTree(
			collectTagStats(indexOf({ 'a.md': { vector: [1], tags: ['project/alpha'] }, 'b.md': { vector: [1], tags: ['project'] } })),
		);
		expect(tree[0]!.children.map((c) => c.tag)).toEqual(['project/alpha']);
	});

	it('totals counts including children', () => {
		const tree = buildTree(
			collectTagStats(indexOf({ 'a.md': { vector: [1], tags: ['project/alpha'] }, 'b.md': { vector: [1], tags: ['project'] } })),
		);
		expect(tree[0]!.totalCount).toBe(2);
	});
});

describe('buildTaxonomy', () => {
	describe('merge candidates', () => {
		it('flags spelling variants', () => {
			const t = buildTaxonomy(
				indexOf({
					'a.md': { vector: [1, 0], tags: ['machine-learning'] },
					'b.md': { vector: [1, 0], tags: ['machine-learning'] },
					'c.md': { vector: [1, 0], tags: ['machinelearning'] },
				}),
			);
			expect(t.mergeCandidates.map((m) => [m.from, m.into])).toEqual([['machinelearning', 'machine-learning']]);
		});

		it('flags abbreviations', () => {
			const t = buildTaxonomy(
				indexOf({
					'a.md': { vector: [1, 0], tags: ['machine-learning'] },
					'b.md': { vector: [0, 1], tags: ['ml'] },
				}),
			);
			expect(t.mergeCandidates[0]!.reasons).toContain('one is an abbreviation of the other');
		});

		it('flags semantically similar tags on different notes', () => {
			const t = buildTaxonomy(
				indexOf({
					'a.md': { vector: [1, 0.01], tags: ['bread'] },
					'b.md': { vector: [1, 0.02], tags: ['bread'] },
					'c.md': { vector: [1, 0.03], tags: ['baking'] },
					'd.md': { vector: [1, 0.04], tags: ['baking'] },
				}),
			);
			expect(t.mergeCandidates.length).toBe(1);
		});

		it('does not flag unrelated tags', () => {
			const t = buildTaxonomy(
				indexOf({
					'a.md': { vector: [1, 0], tags: ['bread'] },
					'b.md': { vector: [0, 1], tags: ['tax'] },
				}),
			);
			expect(t.mergeCandidates).toEqual([]);
		});
	});

	describe('parent candidates', () => {
		it('proposes nesting a tag whose notes all carry a larger tag', () => {
			const notes: Record<string, { vector: number[]; tags: string[] }> = {};
			for (let i = 0; i < 6; i++) notes[`n${i}.md`] = { vector: [1, i], tags: i < 3 ? ['cooking', 'bread'] : ['cooking'] };
			expect(buildTaxonomy(indexOf(notes)).parentCandidates.map((p) => p.proposed)).toEqual(['cooking/bread']);
		});
	});

	describe('prune candidates', () => {
		it('lists tags used once', () => {
			const t = buildTaxonomy(indexOf({ 'a.md': { vector: [1], tags: ['solo'] }, 'b.md': { vector: [1], tags: ['x', 'y'] }, 'c.md': { vector: [1], tags: ['x', 'y'] } }));
			expect(t.pruneCandidates.map((p) => p.tag)).toEqual(['solo']);
		});
	});
});

describe('buildTaxonomyAsync', () => {
	const notes = {
		'a.md': { vector: [1, 0.01], tags: ['machine-learning', 'bread'] },
		'b.md': { vector: [1, 0.02], tags: ['machine-learning', 'baking'] },
		'c.md': { vector: [1, 0.03], tags: ['machinelearning', 'bread'] },
		'd.md': { vector: [1, 0.04], tags: ['ml', 'baking'] },
	};

	it('produces the same taxonomy as the synchronous version', async () => {
		const index = indexOf(notes);
		expect(await buildTaxonomyAsync(index, () => Promise.resolve())).toEqual(buildTaxonomy(index));
	});

	it('yields while working', async () => {
		let ticks = 0;
		await buildTaxonomyAsync(indexOf(notes), () => {
			ticks++;
			return Promise.resolve();
		});
		expect(ticks).toBeGreaterThan(3);
	});
});
