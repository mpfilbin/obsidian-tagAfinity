import { joinFrontmatter, readFrontmatterTags, splitFrontmatter, writeFrontmatterTags } from './frontmatter';
import { dedupeTags, findInlineTags } from './parse';

/** Maps a tag to its replacement, or null to remove it. Tags carry no leading "#". */
export type TagMapper = (tag: string) => string | null;

export function transformTags(content: string, mapper: TagMapper): string {
	const split = splitFrontmatter(content);

	let front = split.front;
	if (front !== null) {
		const existing = readFrontmatterTags(front);
		if (existing) {
			const mapped = existing.tags
				.map(mapper)
				.filter((tag): tag is string => tag !== null && tag !== '');
			const next = dedupeTags(mapped);
			if (next.join('\u0000') !== existing.tags.join('\u0000')) {
				front = writeFrontmatterTags(front, next);
			}
		}
	}

	let body = split.body;
	const inline = findInlineTags(body);
	for (const match of [...inline].reverse()) {
		const start = match.index;
		const end = start + 1 + match.tag.length;
		const replacement = mapper(match.tag);
		if (replacement === match.tag) continue;
		if (replacement === null || replacement === '') {
			const trimStart = body[start - 1] === ' ' ? start - 1 : start;
			body = body.slice(0, trimStart) + body.slice(end);
		} else {
			body = body.slice(0, start) + '#' + replacement + body.slice(end);
		}
	}

	if (front === null && split.front !== null) {
		// Frontmatter lost its only property; keep the (now empty) block intact.
		front = '';
	}
	return joinFrontmatter({ ...split, front, body });
}

export function renameMapper(from: string, to: string): TagMapper {
	const source = from.replace(/^#/, '').toLowerCase();
	const target = to.replace(/^#/, '');
	return (tag) => {
		const lower = tag.toLowerCase();
		if (lower === source) return target;
		if (lower.startsWith(source + '/')) return target + tag.slice(source.length);
		return tag;
	};
}

export function removeMapper(tagToRemove: string): TagMapper {
	const source = tagToRemove.replace(/^#/, '').toLowerCase();
	return (tag) => (tag.toLowerCase() === source ? null : tag);
}

/** Adds tags to the frontmatter tag list, skipping any already present anywhere in the note. */
export function addTags(content: string, additions: string[], existingAll: string[]): string {
	const present = new Set(existingAll.map((t) => t.toLowerCase()));
	const fresh = dedupeTags(additions.map((t) => t.replace(/^#/, ''))).filter(
		(t) => t !== '' && !present.has(t.toLowerCase()),
	);
	if (fresh.length === 0) return content;

	const split = splitFrontmatter(content);
	const current = split.front === null ? [] : (readFrontmatterTags(split.front)?.tags ?? []);
	const front = writeFrontmatterTags(split.front, [...current, ...fresh]);
	if (split.front === null) {
		return `---\n${front ?? ''}\n---\n${split.body}`;
	}
	return joinFrontmatter({ ...split, front: front ?? '' });
}
