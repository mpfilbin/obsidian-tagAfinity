import type { IndexData } from '../index/store';
import { canonicalKey, isAbbreviation, levenshteinRatio } from '../tags/canonical';
import { centroid, dot } from '../vector';

export interface TagStat {
	tag: string;
	count: number;
	notes: string[];
	centroid: number[];
}

export interface TagNode {
	name: string;
	/** Full path, e.g. "project/alpha". */
	tag: string;
	selfCount: number;
	totalCount: number;
	children: TagNode[];
}

export interface MergeCandidate {
	/** The less-used tag, to be renamed into `into`. */
	from: string;
	into: string;
	score: number;
	reasons: string[];
}

export interface ParentCandidate {
	/** Flat tag that could be nested. */
	tag: string;
	parent: string;
	/** Proposed new name, `${parent}/${tag}`. */
	proposed: string;
	containment: number;
}

export interface PruneCandidate {
	tag: string;
	count: number;
	notes: string[];
}

export interface Taxonomy {
	stats: TagStat[];
	tree: TagNode[];
	mergeCandidates: MergeCandidate[];
	parentCandidates: ParentCandidate[];
	pruneCandidates: PruneCandidate[];
}

export interface TaxonomyOptions {
	semanticThreshold: number;
	stringThreshold: number;
	containmentThreshold: number;
	minTagCountForParent: number;
	pruneMaxCount: number;
}

export const DEFAULT_TAXONOMY_OPTIONS: TaxonomyOptions = {
	semanticThreshold: 0.88,
	stringThreshold: 0.85,
	containmentThreshold: 0.8,
	minTagCountForParent: 3,
	pruneMaxCount: 1,
};

export function collectTagStats(index: IndexData): TagStat[] {
	const groups = new Map<string, { casings: Map<string, number>; notes: string[] }>();
	for (const [path, note] of Object.entries(index.notes)) {
		for (const tag of note.tags) {
			const key = tag.toLowerCase();
			const group = groups.get(key) ?? { casings: new Map<string, number>(), notes: [] as string[] };
			group.casings.set(tag, (group.casings.get(tag) ?? 0) + 1);
			if (!group.notes.includes(path)) group.notes.push(path);
			groups.set(key, group);
		}
	}
	return [...groups.values()]
		.map((group) => {
			const display = [...group.casings.entries()].sort((a, b) => b[1] - a[1])[0]![0];
			return {
				tag: display,
				count: group.notes.length,
				notes: group.notes,
				centroid: centroid(group.notes.map((p) => index.notes[p]!.vector)),
			};
		})
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function buildTree(stats: TagStat[]): TagNode[] {
	const roots: TagNode[] = [];
	const lookup = new Map<string, TagNode>();

	const ensure = (path: string[]): TagNode => {
		const key = path.join('/').toLowerCase();
		const found = lookup.get(key);
		if (found) return found;
		const node: TagNode = { name: path[path.length - 1]!, tag: path.join('/'), selfCount: 0, totalCount: 0, children: [] };
		lookup.set(key, node);
		if (path.length === 1) roots.push(node);
		else ensure(path.slice(0, -1)).children.push(node);
		return node;
	};

	for (const stat of stats) {
		const node = ensure(stat.tag.split('/'));
		node.selfCount = stat.count;
	}
	const total = (node: TagNode): number => {
		node.totalCount = node.selfCount + node.children.reduce((sum, child) => sum + total(child), 0);
		node.children.sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name));
		return node.totalCount;
	};
	roots.forEach(total);
	return roots.sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name));
}

function jaccard(a: string[], b: string[]): number {
	const setB = new Set(b);
	const shared = a.filter((x) => setB.has(x)).length;
	return shared / (a.length + b.length - shared || 1);
}

export function findMergeCandidates(stats: TagStat[], options: TaxonomyOptions): MergeCandidate[] {
	const out: MergeCandidate[] = [];
	for (let i = 0; i < stats.length; i++) {
		for (let j = i + 1; j < stats.length; j++) {
			const a = stats[i]!; // a is at least as used as b because stats are sorted by count
			const b = stats[j]!;
			const reasons: string[] = [];
			let score = 0;

			if (canonicalKey(a.tag) === canonicalKey(b.tag)) {
				reasons.push('same spelling apart from case, separators or plural');
				score = 1;
			} else {
				const ratio = levenshteinRatio(a.tag.toLowerCase(), b.tag.toLowerCase());
				if (ratio >= options.stringThreshold && Math.min(a.tag.length, b.tag.length) >= 4) {
					reasons.push(`spelled very similarly (${Math.round(ratio * 100)}%)`);
					score = Math.max(score, ratio);
				}
				if (isAbbreviation(a.tag, b.tag) || isAbbreviation(b.tag, a.tag)) {
					reasons.push('one is an abbreviation of the other');
					score = Math.max(score, 0.9);
				}
				if (a.count >= 2 && b.count >= 2 && a.centroid.length > 0) {
					const sim = dot(a.centroid, b.centroid);
					if (sim >= options.semanticThreshold && jaccard(a.notes, b.notes) <= 0.5) {
						reasons.push(`used on semantically similar notes (${Math.round(sim * 100)}%)`);
						score = Math.max(score, sim);
					}
				}
			}
			if (reasons.length > 0) out.push({ from: b.tag, into: a.tag, score, reasons });
		}
	}
	return out.sort((x, y) => y.score - x.score);
}

export function findParentCandidates(stats: TagStat[], options: TaxonomyOptions): ParentCandidate[] {
	const flat = stats.filter((s) => !s.tag.includes('/'));
	const out: ParentCandidate[] = [];
	for (const child of flat) {
		if (child.count < options.minTagCountForParent) continue;
		let best: ParentCandidate | null = null;
		for (const parent of flat) {
			if (parent === child || parent.count < child.count * 1.5) continue;
			const parentNotes = new Set(parent.notes);
			const containment = child.notes.filter((n) => parentNotes.has(n)).length / child.count;
			if (containment >= options.containmentThreshold && (!best || containment > best.containment)) {
				best = { tag: child.tag, parent: parent.tag, proposed: `${parent.tag}/${child.tag}`, containment };
			}
		}
		if (best) out.push(best);
	}
	return out.sort((a, b) => b.containment - a.containment);
}

export function buildTaxonomy(index: IndexData, overrides: Partial<TaxonomyOptions> = {}): Taxonomy {
	const options = { ...DEFAULT_TAXONOMY_OPTIONS, ...overrides };
	const stats = collectTagStats(index);
	return {
		stats,
		tree: buildTree(stats),
		mergeCandidates: findMergeCandidates(stats, options),
		parentCandidates: findParentCandidates(stats, options),
		pruneCandidates: stats
			.filter((s) => s.count <= options.pruneMaxCount)
			.map((s) => ({ tag: s.tag, count: s.count, notes: s.notes })),
	};
}

/** Paths of notes carrying `tag` or any of its nested children. */
export function notesForTag(stats: TagStat[], tag: string): string[] {
	const lower = tag.toLowerCase();
	const paths = new Set<string>();
	for (const stat of stats) {
		const candidate = stat.tag.toLowerCase();
		if (candidate === lower || candidate.startsWith(lower + '/')) stat.notes.forEach((p) => paths.add(p));
	}
	return [...paths];
}
