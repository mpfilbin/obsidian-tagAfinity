import type { TagNode } from './build';

export type TreeSort = 'count' | 'name';

export interface FilteredTree {
	nodes: TagNode[];
	/** Tag paths (lower case) to show open so every match is visible. */
	expand: Set<string>;
}

const key = (node: TagNode): string => node.tag.toLowerCase();

/**
 * Keeps nodes whose full tag path contains every word of the query, together with their ancestors (so a match is
 * visible in context) and, for a matching node, all of its descendants. Returns copies; the input is untouched.
 */
export function filterTree(nodes: TagNode[], query: string): FilteredTree {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return { nodes, expand: new Set() };

	const expand = new Set<string>();
	const visit = (node: TagNode): TagNode | null => {
		const path = key(node);
		if (words.every((word) => path.includes(word))) return node;
		const children = node.children.map(visit).filter((child): child is TagNode => child !== null);
		if (children.length === 0) return null;
		expand.add(path);
		return { ...node, children };
	};
	return { nodes: nodes.map(visit).filter((node): node is TagNode => node !== null), expand };
}

export function sortTree(nodes: TagNode[], mode: TreeSort): TagNode[] {
	const compare =
		mode === 'count'
			? (a: TagNode, b: TagNode) => b.totalCount - a.totalCount || a.name.localeCompare(b.name)
			: (a: TagNode, b: TagNode) => a.name.localeCompare(b.name);
	return nodes
		.map((node) => ({ ...node, children: sortTree(node.children, mode) }))
		.sort(compare);
}

/** Which nodes start open: the top level, so its children are visible and deeper levels stay collapsed. */
export function defaultExpanded(nodes: TagNode[]): Set<string> {
	return new Set(nodes.map(key));
}
