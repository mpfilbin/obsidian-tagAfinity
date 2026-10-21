// Minimal stand-in for the parts of the Obsidian API the vault gateway uses, so it can be tested without Obsidian.
export class TFile {
	constructor(
		public path: string,
		public stat = { mtime: 0, size: 0 },
	) {}
}

export interface FakeCache {
	/** Tags as getAllTags would report them, with a leading "#". */
	tags?: string[];
}

export function getAllTags(cache: FakeCache | null): string[] | null {
	return cache?.tags ?? null;
}
