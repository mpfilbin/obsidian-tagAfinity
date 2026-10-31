import type { TagNode } from './build';
import { sortTree } from './tree-view';

export interface ExportOptions {
	generatedAt: Date;
}

const FENCE = '---';
const GENERATOR_LINE = 'generator: Tagafinity';
const TYPE_LINE = 'type: tag-taxonomy';

const plural = (count: number): string => `${count} ${count === 1 ? 'note' : 'notes'}`;

function countTags(nodes: TagNode[]): number {
	return nodes.reduce((total, node) => total + 1 + countTags(node.children), 0);
}

function describeNode(node: TagNode): string {
	const base = `\`${node.tag}\` — ${plural(node.totalCount)}`;
	if (node.selfCount === 0) return `${base} (grouping only)`;
	return node.selfCount === node.totalCount ? base : `${base} (${node.selfCount} direct)`;
}

function listNodes(nodes: TagNode[], depth: number): string[] {
	return nodes.flatMap((node) => [`${'  '.repeat(depth)}- ${describeNode(node)}`, ...listNodes(node.children, depth + 1)]);
}

const HOW_TO_READ = [
	'## How to read this',
	'',
	'- Tags are hierarchical: `/` separates levels, and a tag\'s parent is everything before its last `/`.',
	'- Tags are written here without the leading `#`. In a note, write `#tag/path` in the text or list `tag/path` under `tags` in its properties.',
	'- Each entry shows how many distinct notes carry the tag or any tag nested under it. `(N direct)` is how many carry exactly that tag; it is left out when every one of them does.',
	'- `(grouping only)` marks a tag that no note carries by itself: it exists only as the prefix of nested tags.',
	'- Tag names are case-insensitive, and searching for a parent tag also finds notes with any tag nested under it.',
	'- Prefer an existing tag over inventing a new one, and use the most specific one that fits.',
];

/**
 * Renders the tag hierarchy as markdown: front matter with a few machine-readable facts, a short legend and a nested
 * list of every tag with its note counts. Siblings are ordered by name so repeated exports differ only where the vault does.
 */
export function renderTaxonomyMarkdown(tree: TagNode[], options: ExportOptions): string {
	const sorted = sortTree(tree, 'name');
	const taggedNotes = new Set(sorted.flatMap((node) => node.notes));
	const out = [
		FENCE,
		GENERATOR_LINE,
		TYPE_LINE,
		`generated: ${options.generatedAt.toISOString()}`,
		`tag_count: ${countTags(sorted)}`,
		`note_count: ${taggedNotes.size}`,
		FENCE,
		'',
		'# Tag taxonomy',
		'',
		'The tag taxonomy of an Obsidian vault, exported by the Tagafinity plugin from its index.',
		'',
	];
	if (sorted.length === 0) {
		out.push('_No tags found in the index._');
	} else {
		out.push(...HOW_TO_READ, '', '## Taxonomy', '', ...listNodes(sorted, 0));
	}
	return out.join('\n') + '\n';
}

/** True when the text begins with the front matter written by renderTaxonomyMarkdown, so it is safe to overwrite. */
export function isTaxonomyExport(text: string): boolean {
	const header = text.replace(/\r\n/g, '\n').split('\n').slice(0, 4);
	return header[0] === FENCE && header[1] === GENERATOR_LINE && header[2] === TYPE_LINE;
}
