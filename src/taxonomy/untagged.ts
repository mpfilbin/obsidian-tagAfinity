import type { IndexData } from '../index/store';

/** Paths of indexed notes that have no tags, in properties or in the text, sorted by path. */
export function findUntaggedNotes(index: IndexData): string[] {
	return Object.entries(index.notes)
		.filter(([, note]) => note.tags.length === 0)
		.map(([path]) => path)
		.sort((a, b) => a.localeCompare(b));
}

/** Paths containing every word of the query (case-insensitive), at most `limit` of them. */
export function filterNotePaths(paths: string[], query: string, limit = Infinity): string[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	return paths.filter((path) => words.every((word) => path.toLowerCase().includes(word))).slice(0, limit);
}

/** One line for the top of the list: how many untagged notes there are, how many a filter leaves, and whether the index is stale. */
export function describeUntaggedCount(total: number, shown: number, indexBehind: boolean): string {
	if (total === 0) return 'Every indexed note has at least one tag';
	const noun = total === 1 ? 'note' : 'notes';
	const count = shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`;
	return `${count} without tags${indexBehind ? ' (the index is behind the vault: update it for an exact list)' : ''}`;
}
