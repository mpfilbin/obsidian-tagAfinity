import { removeMapper, removeTreeMapper, renameMapper, type TagMapper } from '../tags/transform';
import type { TagStat } from '../taxonomy/build';

/** One proposed change to the tags in a vault. Nothing is written until it has been previewed and confirmed. */
export interface TagAction {
	/** Identifies the change, so the same one is not staged twice. */
	key: string;
	description: string;
	mapper: TagMapper;
	/** The tag the change starts from; used to mark it in the tag tree. */
	source: string;
	/** The tag it ends up as, for renames, moves and merges. */
	target?: string;
}

export type ActionResult = { ok: true; action: TagAction } | { ok: false; error: string };

const bare = (tag: string): string => tag.trim().replace(/^#/, '');
const lower = (tag: string): string => tag.toLowerCase();
const lastSegment = (tag: string): string => tag.slice(tag.lastIndexOf('/') + 1);

/** Returns why `name` cannot be a tag, or null when it can. A leading "#" is ignored. */
export function validateTagName(name: string): string | null {
	const tag = bare(name);
	if (tag === '') return 'The name cannot be empty.';
	if (/\s/.test(tag)) return 'Tag names cannot contain spaces.';
	if (tag.startsWith('/') || tag.endsWith('/') || tag.includes('//')) return 'A tag cannot start or end with a slash or contain empty parts.';
	if (!/^[\p{L}\p{N}_\-/]+$/u.test(tag)) return 'Tags can only contain letters, digits, underscores, hyphens and slashes.';
	if (/^[\p{N}/]+$/u.test(tag)) return 'A tag cannot consist only of digits.';
	return null;
}

/** True when `tag` is `ancestor` or nested somewhere under it (case-insensitive). */
export function isSameOrDescendant(tag: string, ancestor: string): boolean {
	const t = lower(bare(tag));
	const a = lower(bare(ancestor));
	return t === a || t.startsWith(a + '/');
}

/** Renames the last part of a tag, keeping its parent. Nested tags follow. */
export function renameAction(from: string, newName: string): ActionResult {
	const source = bare(from);
	const leaf = bare(newName);
	const error = validateTagName(leaf);
	if (error) return { ok: false, error };
	const parent = source.includes('/') ? source.slice(0, source.lastIndexOf('/')) : '';
	const full = parent ? `${parent}/${leaf}` : leaf;
	if (full === source) return { ok: false, error: 'That is the same name.' };
	return { ok: true, action: { key: `rename:${source}>${full}`, description: `Rename #${source} to #${full}`, mapper: renameMapper(source, full), source, target: full } };
}

/** Nests a tag under `newParent` (empty for the top level), keeping its last part. Nested tags follow. */
export function moveAction(tag: string, newParent: string): ActionResult {
	const source = bare(tag);
	const parent = bare(newParent);
	if (parent !== '') {
		const error = validateTagName(parent);
		if (error) return { ok: false, error };
		if (isSameOrDescendant(parent, source)) return { ok: false, error: 'A tag cannot be moved inside itself.' };
	}
	const full = parent ? `${parent}/${lastSegment(source)}` : lastSegment(source);
	if (lower(full) === lower(source)) return { ok: false, error: 'It is already there.' };
	const description = parent ? `Move #${source} under #${parent}` : `Move #${source} to the top level`;
	return { ok: true, action: { key: `move:${source}>${full}`, description, mapper: renameMapper(source, full), source, target: full } };
}

/** Folds a tag into another; nested tags follow. */
export function mergeAction(from: string, into: string): ActionResult {
	const source = bare(from);
	const target = bare(into);
	const error = validateTagName(target);
	if (error) return { ok: false, error };
	if (isSameOrDescendant(target, source)) return { ok: false, error: 'A tag cannot be merged into itself.' };
	return { ok: true, action: { key: `merge:${source}>${target}`, description: `Merge #${source} into #${target}`, mapper: renameMapper(source, target), source, target } };
}

/** Removes a tag from every note, optionally with its nested tags. */
export function removeAction(tag: string, withNested: boolean): { action: TagAction } {
	const source = bare(tag);
	return {
		action: {
			key: `remove:${source}:${withNested ? 'tree' : 'tag'}`,
			description: withNested ? `Remove #${source} and nested tags` : `Remove #${source}`,
			mapper: withNested ? removeTreeMapper(source) : removeMapper(source),
			source,
		},
	};
}

/** Notes carrying any tag the mapper would change, found by running it over every tag in the vault. */
export function affectedNotes(stats: TagStat[], mapper: TagMapper): string[] {
	const paths = new Set<string>();
	for (const stat of stats) {
		if (mapper(stat.tag) !== stat.tag) for (const path of stat.notes) paths.add(path);
	}
	return [...paths];
}
