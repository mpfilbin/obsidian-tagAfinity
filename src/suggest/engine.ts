import type { IndexData } from '../index/store';
import { canonicalKey } from '../tags/canonical';
import { extractKeywords } from '../text/keywords';
import { slugify } from '../text/tokenize';
import type { Neighbor, TagSuggestion } from '../types';
import { dot } from '../vector';

export interface SuggestOptions {
	neighbors: number;
	minSimilarity: number;
	minScore: number;
	maxSuggestions: number;
	/** New tags are proposed only when fewer than this many existing tags qualify. */
	minExisting: number;
	maxNew: number;
}

export const DEFAULT_SUGGEST_OPTIONS: SuggestOptions = {
	neighbors: 10,
	minSimilarity: 0.35,
	minScore: 0.25,
	maxSuggestions: 8,
	minExisting: 3,
	maxNew: 2,
};

export interface SuggestInput {
	queryPath: string;
	queryVector: number[];
	queryContent: string;
	/** Tags already on the note; never suggested again. */
	currentTags: string[];
	index: IndexData;
	options?: Partial<SuggestOptions>;
}

export function nearestNotes(queryPath: string, queryVector: number[], index: IndexData, limit: number, minSimilarity: number): Neighbor[] {
	const result: Neighbor[] = [];
	for (const [path, note] of Object.entries(index.notes)) {
		if (path === queryPath) continue;
		const similarity = dot(queryVector, note.vector);
		if (similarity >= minSimilarity) result.push({ path, similarity });
	}
	return result.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

export function suggestTags(input: SuggestInput): TagSuggestion[] {
	const options: SuggestOptions = { ...DEFAULT_SUGGEST_OPTIONS, ...input.options };
	const { index } = input;
	const current = new Set(input.currentTags.map((t) => t.toLowerCase()));
	const noteCount = Math.max(1, Object.keys(index.notes).length);

	// Vault-wide tag frequency and canonical casing.
	const vaultTags = new Map<string, { display: string; count: number }>();
	for (const note of Object.values(index.notes)) {
		for (const tag of note.tags) {
			const key = tag.toLowerCase();
			const entry = vaultTags.get(key) ?? { display: tag, count: 0 };
			entry.count++;
			vaultTags.set(key, entry);
		}
	}

	const neighbors = nearestNotes(input.queryPath, input.queryVector, index, options.neighbors, options.minSimilarity);
	const totalWeight = neighbors.reduce((sum, n) => sum + n.similarity ** 2, 0);

	const votes = new Map<string, { weight: number; evidence: Neighbor[] }>();
	for (const neighbor of neighbors) {
		const weight = neighbor.similarity ** 2;
		for (const tag of index.notes[neighbor.path]!.tags) {
			const key = tag.toLowerCase();
			const entry = votes.get(key) ?? { weight: 0, evidence: [] };
			entry.weight += weight;
			entry.evidence.push(neighbor);
			votes.set(key, entry);
		}
	}

	const existing: TagSuggestion[] = [];
	for (const [key, vote] of votes) {
		if (current.has(key)) continue;
		const specificity = 1 - 0.5 * ((vaultTags.get(key)?.count ?? 0) / noteCount);
		const score = (vote.weight / totalWeight) * specificity;
		if (score < options.minScore) continue;
		existing.push({
			tag: vaultTags.get(key)?.display ?? key,
			score,
			isNew: false,
			evidence: vote.evidence.slice(0, 3),
		});
	}
	existing.sort((a, b) => b.score - a.score);
	const kept = existing.slice(0, options.maxSuggestions);

	if (kept.length >= options.minExisting) return kept;
	return [...kept, ...keywordSuggestions(input, options, vaultTags, kept, current)].slice(0, options.maxSuggestions);
}

function keywordSuggestions(
	input: SuggestInput,
	options: SuggestOptions,
	vaultTags: Map<string, { display: string; count: number }>,
	alreadySuggested: TagSuggestion[],
	current: Set<string>,
): TagSuggestion[] {
	const keywords = extractKeywords(input.queryContent, input.index, 12);
	if (keywords.length === 0) return [];
	const top = keywords[0]!.score;

	const byCanonical = new Map<string, string>();
	for (const [key, entry] of vaultTags) byCanonical.set(canonicalKey(key), entry.display);
	const taken = new Set([...current, ...alreadySuggested.map((s) => s.tag.toLowerCase())]);
	const takenCanonical = new Set([...taken].map(canonicalKey));

	const out: TagSuggestion[] = [];
	let newCount = 0;
	for (const keyword of keywords) {
		const slug = slugify(keyword.term);
		if (slug.length < 3) continue;
		const key = canonicalKey(slug);
		if (takenCanonical.has(key)) continue;
		const relative = keyword.score / top;

		const vaultMatch = byCanonical.get(key);
		if (vaultMatch) {
			out.push({ tag: vaultMatch, score: 0.3 * relative, isNew: false, evidence: [], terms: [keyword.term] });
			takenCanonical.add(key);
		} else if (newCount < options.maxNew) {
			out.push({ tag: slug, score: 0.25 * relative, isNew: true, evidence: [], terms: [keyword.term] });
			takenCanonical.add(key);
			newCount++;
		}
	}
	// Prefer existing tags over new ones, as requested.
	return out.sort((a, b) => Number(a.isNew) - Number(b.isNew) || b.score - a.score);
}
