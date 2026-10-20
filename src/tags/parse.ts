import { readFrontmatterTags, splitFrontmatter } from './frontmatter';

export interface InlineTagMatch {
	/** Tag text without the leading "#". */
	tag: string;
	/** Offset of the "#" within the scanned text. */
	index: number;
}

const INLINE_TAG = /(?<![\w#&/\\])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

function blank(match: string): string {
	return match.replace(/[^\n]/g, ' ');
}

/** Replaces regions that cannot contain tags (code, links, comments) with spaces, preserving offsets. */
export function maskNonTagRegions(text: string): string {
	return text
		.replace(/```[\s\S]*?(```|$)/g, blank)
		.replace(/~~~[\s\S]*?(~~~|$)/g, blank)
		.replace(/`[^`\n]*`/g, blank)
		.replace(/%%[\s\S]*?%%/g, blank)
		.replace(/\[\[[^\]]*\]\]/g, blank)
		.replace(/\]\([^)]*\)/g, blank);
}

export function findInlineTags(text: string): InlineTagMatch[] {
	const masked = maskNonTagRegions(text);
	const matches: InlineTagMatch[] = [];
	for (const m of masked.matchAll(INLINE_TAG)) {
		matches.push({ tag: (m[1] ?? '').replace(/[/_-]+$/, ''), index: m.index ?? 0 });
	}
	return matches.filter((m) => m.tag !== '');
}

export interface NoteTags {
	frontmatter: string[];
	inline: string[];
	/** Union, de-duplicated case-insensitively, original casing of first occurrence kept. */
	all: string[];
}

export function dedupeTags(tags: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const tag of tags) {
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(tag);
	}
	return out;
}

export function extractTags(content: string): NoteTags {
	const { front, body } = splitFrontmatter(content);
	const frontmatter = front === null ? [] : (readFrontmatterTags(front)?.tags ?? []);
	const inline = findInlineTags(body).map((m) => m.tag);
	return {
		frontmatter,
		inline,
		all: dedupeTags([...frontmatter, ...inline]),
	};
}
