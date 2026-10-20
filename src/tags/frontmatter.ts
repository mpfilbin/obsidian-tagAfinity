export interface FrontmatterSplit {
	/** Everything before the frontmatter body, e.g. "---\n". Empty when there is no frontmatter. */
	open: string;
	/** Inner frontmatter text, or null when the note has none. */
	front: string | null;
	/** Everything from the closing fence to the end of the fence line. */
	close: string;
	body: string;
}

const FRONTMATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;

export function splitFrontmatter(content: string): FrontmatterSplit {
	const match = FRONTMATTER.exec(content);
	if (!match) {
		return { open: '', front: null, close: '', body: content };
	}
	return {
		open: match[1] ?? '',
		front: match[2] ?? '',
		close: match[3] ?? '',
		body: content.slice(match[0].length),
	};
}

export function joinFrontmatter(split: FrontmatterSplit): string {
	if (split.front === null) return split.body;
	return split.open + split.front + split.close + split.body;
}

export type TagListStyle = 'flow' | 'comma' | 'space' | 'block';

export interface FrontmatterTags {
	key: string;
	tags: string[];
	style: TagListStyle;
	indent: string;
	/** Inclusive line range of the tags property within the frontmatter text. */
	startLine: number;
	endLine: number;
}

const KEY_LINE = /^(tags|tag)\s*:\s*(.*?)\s*$/i;
const BLOCK_ITEM = /^(\s*)-\s*(.*?)\s*$/;

function clean(raw: string): string {
	return raw.trim().replace(/^["']|["']$/g, '').replace(/^#/, '').trim();
}

export function readFrontmatterTags(front: string): FrontmatterTags | null {
	const lines = front.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const match = KEY_LINE.exec(lines[i] ?? '');
		if (!match) continue;
		const key = match[1] ?? 'tags';
		const rest = match[2] ?? '';

		if (rest.startsWith('[')) {
			const inner = rest.replace(/^\[/, '').replace(/\]\s*$/, '');
			const tags = inner.split(',').map(clean).filter(Boolean);
			return { key, tags, style: 'flow', indent: '', startLine: i, endLine: i };
		}
		if (rest !== '') {
			const style: TagListStyle = rest.includes(',') ? 'comma' : 'space';
			const tags = rest.split(style === 'comma' ? ',' : /\s+/).map(clean).filter(Boolean);
			return { key, tags, style, indent: '', startLine: i, endLine: i };
		}

		const tags: string[] = [];
		let indent = '  ';
		let end = i;
		for (let j = i + 1; j < lines.length; j++) {
			const item = BLOCK_ITEM.exec(lines[j] ?? '');
			if (!item) break;
			if (j === i + 1) indent = item[1] ?? '  ';
			const tag = clean(item[2] ?? '');
			if (tag) tags.push(tag);
			end = j;
		}
		return { key, tags, style: 'block', indent, startLine: i, endLine: end };
	}
	return null;
}

function serialize(key: string, tags: string[], style: TagListStyle, indent: string): string[] {
	switch (style) {
		case 'flow':
			return [`${key}: [${tags.join(', ')}]`];
		case 'comma':
			return [`${key}: ${tags.join(', ')}`];
		case 'space':
			return [`${key}: ${tags.join(' ')}`];
		case 'block':
			return [`${key}:`, ...tags.map((tag) => `${indent}- ${tag}`)];
	}
}

/** Returns new frontmatter text with the tag list replaced. Removes the property when `tags` is empty. */
export function writeFrontmatterTags(front: string | null, tags: string[]): string | null {
	if (front === null) {
		if (tags.length === 0) return null;
		return serialize('tags', tags, 'block', '  ').join('\n');
	}
	const lines = front.split(/\r?\n/);
	const existing = readFrontmatterTags(front);
	if (!existing) {
		if (tags.length === 0) return front;
		const prefix = front === '' ? [] : lines;
		return [...prefix, ...serialize('tags', tags, 'block', '  ')].join('\n');
	}
	const replacement =
		tags.length === 0 ? [] : serialize(existing.key, tags, existing.style, existing.indent);
	lines.splice(existing.startLine, existing.endLine - existing.startLine + 1, ...replacement);
	return lines.join('\n');
}
