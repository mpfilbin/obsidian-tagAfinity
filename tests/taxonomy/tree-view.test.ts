import { describe, it, expect } from 'vitest';
import { buildTree, collectTagStats, type TagNode } from '../../src/taxonomy/build';
import { defaultExpanded, filterTree, sortTree } from '../../src/taxonomy/tree-view';
import { indexOf } from '../helpers';

function tree(tagsByNote: Record<string, string[]>): TagNode[] {
	return buildTree(
		collectTagStats(indexOf(Object.fromEntries(Object.entries(tagsByNote).map(([p, tags]) => [p, { vector: [1], tags }]))), { centroids: false }),
	);
}

const sample = () =>
	tree({
		'1.md': ['software/architecture/styles', 'software/architecture/styles', 'cooking/bread'],
		'2.md': ['software/architecture/styles'],
		'3.md': ['software/design/patterns'],
		'4.md': ['cooking/bread'],
		'5.md': ['cooking/soup'],
		'6.md': ['alpha'],
		'7.md': ['software/design/patterns'],
	});

const paths = (nodes: TagNode[]): string[] => nodes.flatMap((n) => [n.tag, ...paths(n.children)]);

describe('filterTree', () => {
	describe('when the query is empty', () => {
		it('keeps every node', () => {
			expect(paths(filterTree(sample(), '').nodes)).toEqual(paths(sample()));
		});
	});

	describe('when a leaf matches', () => {
		it('keeps it with its ancestors', () => {
			expect(paths(filterTree(sample(), 'patterns').nodes)).toEqual(['software', 'software/design', 'software/design/patterns']);
		});

		it('asks for the ancestors to be expanded', () => {
			expect([...filterTree(sample(), 'patterns').expand].sort()).toEqual(['software', 'software/design']);
		});
	});

	describe('when a parent matches', () => {
		it('keeps all of its children', () => {
			expect(paths(filterTree(sample(), 'architecture').nodes)).toEqual(['software', 'software/architecture', 'software/architecture/styles']);
		});
	});

	describe('when nothing matches', () => {
		it('is empty', () => {
			expect(filterTree(sample(), 'zzz').nodes).toEqual([]);
		});
	});

	it('ignores case', () => {
		expect(paths(filterTree(sample(), 'BREAD').nodes)).toContain('cooking/bread');
	});

	describe('with several words', () => {
		it('requires all of them in the tag path', () => {
			expect(paths(filterTree(sample(), 'software styles').nodes)).toEqual(['software', 'software/architecture', 'software/architecture/styles']);
		});
	});

	it('does not modify the original tree', () => {
		const original = sample();
		filterTree(original, 'patterns');
		expect(paths(original)).toEqual(paths(sample()));
	});
});

describe('sortTree', () => {
	it('orders siblings by note count, highest first', () => {
		expect(sortTree(sample(), 'count').map((n) => n.tag)[0]).toBe('software');
	});

	it('orders siblings by name', () => {
		expect(sortTree(sample(), 'name').map((n) => n.tag)).toEqual(['alpha', 'cooking', 'software']);
	});

	it('sorts nested levels too', () => {
		const cooking = sortTree(sample(), 'name').find((n) => n.tag === 'cooking')!;
		expect(cooking.children.map((c) => c.name)).toEqual(['bread', 'soup']);
	});
});

describe('defaultExpanded', () => {
	it('opens the top level so its children are visible', () => {
		expect([...defaultExpanded(sample())].sort()).toEqual(['alpha', 'cooking', 'software']);
	});

	it('leaves deeper levels collapsed', () => {
		expect(defaultExpanded(sample()).has('software/architecture')).toBe(false);
	});
});
