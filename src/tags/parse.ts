import { readFrontmatterTags, splitFrontmatter } from './frontmatter';

export interface InlineTagMatch {
	/** Tag text without the leading "#". */
	tag: string;
	/** Offset of the "#" within the scanned text. */
	index: number;
}

/**
 * Bumped whenever the rules for what counts as a tag change, so an index built under older rules is refreshed.
 * (1: the original rules; 2: HTML, SVG and links are ignored.)
 */
export const TAG_PARSER_VERSION = 2;

const INLINE_TAG = /(?<![\w#&/\\])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

function blank(match: string): string {
	return match.replace(/[^\n]/g, ' ');
}

/**
 * Replaces regions where a "#" is not a tag with spaces, preserving offsets: code, comments, HTML (a "#" there is
 * a color, an id or an anchor), SVG, and links (a "#" there is an anchor). The text between HTML tags, and the
 * visible text of a link, can still contain tags.
 */
export function maskNonTagRegions(text: string): string {
	return text
		// Code
		.replace(/```[\s\S]*?(```|$)/g, blank)
		.replace(/~~~[\s\S]*?(~~~|$)/g, blank)
		.replace(/`[^`\n]*`/g, blank)
		// Comments
		.replace(/%%[\s\S]*?%%/g, blank)
		.replace(/<!--[\s\S]*?-->/g, blank)
		// HTML whose whole content is not prose: SVG drawings, stylesheets and scripts
		.replace(/<(svg|style|script)\b[\s\S]*?<\/\1\s*>/gi, blank)
		// Every other HTML tag, attributes included (colors such as "#fff", ids, href="#section", url(#id)) and autolinks
		.replace(/<\/?[A-Za-z][^<>]*>/g, blank)
		// Links: Obsidian wikilinks and embeds, Markdown link targets (also in angle brackets), reference definitions
		.replace(/\[\[[^\]]*\]\]/g, blank)
		.replace(/\]\(<[^>]*>[^)]*\)/g, blank)
		.replace(/\]\((?:[^()\n]|\([^()\n]*\))*\)/g, blank)
		.replace(/^[ \t]{0,3}\[(?!\^)[^\]\n]+\]:[^\n]*/gm, blank)
		// Bare URLs
		.replace(/\b(?:https?:\/\/|www\.)(?:[^\s<>()\]]|\([^\s<>()]*\))+/gi, blank);
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
