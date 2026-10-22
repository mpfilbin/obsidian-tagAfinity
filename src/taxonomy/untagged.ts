import type { IndexData } from '../index/store';

/** Paths of indexed notes that have no tags, in properties or in the text, sorted by path. */
export function findUntaggedNotes(index: IndexData): string[] {
	return Object.entries(index.notes)
		.filter(([, note]) => note.tags.length === 0)
		.map(([path]) => path)
		.sort((a, b) => a.localeCompare(b));
}

/** Paths containing every word of the query (case-insensitive), at most `limit` of them. */
export function filterNotePaths(paths: string[], query: string, limit = 50): string[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	return paths.filter((path) => words.every((word) => path.toLowerCase().includes(word))).slice(0, limit);
}
