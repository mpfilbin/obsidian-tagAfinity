export interface TagUsage {
	tag: string;
	count: number;
}

export interface NoteEntry {
	path: string;
	content: string;
}

export interface Neighbor {
	path: string;
	similarity: number;
}

export interface TagSuggestion {
	tag: string;
	score: number;
	isNew: boolean;
	/** Neighbouring notes that carry this tag (existing tags) or the terms that produced it (new tags). */
	evidence: Neighbor[];
	terms?: string[];
}
