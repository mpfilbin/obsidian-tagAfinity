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
	/** Notes tagged with exactly this tag. Zero when the node exists only because nested tags use it. */
	selfCount: number;
	/** Distinct notes carrying this tag or any nested one; a note is counted once however many of them it has. */
	totalCount: number;
	/** Those distinct notes. */
	notes: string[];
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

export function collectTagStats(index: IndexData, options: { centroids?: boolean } = {}): TagStat[] {
	const withCentroids = options.centroids ?? true;
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
			const display = [...group.casings.entries()].sort((a, b) => b[1] - a[1])[0][0];
			return {
				tag: display,
				count: group.notes.length,
				notes: group.notes,
				centroid: withCentroids ? centroid(group.notes.map((p) => index.notes[p].vector)) : [],
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
		const node: TagNode = { name: path[path.length - 1], tag: path.join('/'), selfCount: 0, totalCount: 0, notes: [], children: [] };
		lookup.set(key, node);
		if (path.length === 1) roots.push(node);
		else ensure(path.slice(0, -1)).children.push(node);
		return node;
	};

	const own = new Map<TagNode, string[]>();
	for (const stat of stats) {
		const node = ensure(stat.tag.split('/'));
		node.selfCount = stat.count;
		own.set(node, stat.notes);
	}
	// A note is counted once under a parent however many of its nested tags the note carries.
	const gather = (node: TagNode): Set<string> => {
		const notes = new Set(own.get(node) ?? []);
		for (const child of node.children) for (const path of gather(child)) notes.add(path);
		node.notes = [...notes];
		node.totalCount = notes.size;
		node.children.sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name));
		return notes;
	};
	roots.forEach(gather);
	return roots.sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name));
}

function jaccard(a: string[], b: string[]): number {
	const setB = new Set(b);
	const shared = a.filter((x) => setB.has(x)).length;
	return shared / (a.length + b.length - shared || 1);
}

function mergeCandidateFor(a: TagStat, b: TagStat, options: TaxonomyOptions): MergeCandidate | null {
	// a is at least as used as b because stats are sorted by count
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
	return reasons.length > 0 ? { from: b.tag, into: a.tag, score, reasons } : null;
}

const byScore = (x: MergeCandidate, y: MergeCandidate): number => y.score - x.score;

export function findMergeCandidates(stats: TagStat[], options: TaxonomyOptions): MergeCandidate[] {
	const out: MergeCandidate[] = [];
	for (let i = 0; i < stats.length; i++) {
		for (let j = i + 1; j < stats.length; j++) {
			const candidate = mergeCandidateFor(stats[i], stats[j], options);
			if (candidate) out.push(candidate);
		}
	}
	return out.sort(byScore);
}

export async function findMergeCandidatesAsync(
	stats: TagStat[],
	options: TaxonomyOptions,
	tick: () => Promise<void>,
): Promise<MergeCandidate[]> {
	const out: MergeCandidate[] = [];
	for (let i = 0; i < stats.length; i++) {
		for (let j = i + 1; j < stats.length; j++) {
			const candidate = mergeCandidateFor(stats[i], stats[j], options);
			if (candidate) out.push(candidate);
		}
		await tick();
	}
	return out.sort(byScore);
}

function bestParentFor(child: TagStat, flat: TagStat[], options: TaxonomyOptions): ParentCandidate | null {
	if (child.count < options.minTagCountForParent) return null;
	let best: ParentCandidate | null = null;
	for (const parent of flat) {
		if (parent === child || parent.count < child.count * 1.5) continue;
		const parentNotes = new Set(parent.notes);
		const containment = child.notes.filter((n) => parentNotes.has(n)).length / child.count;
		if (containment >= options.containmentThreshold && (!best || containment > best.containment)) {
			best = { tag: child.tag, parent: parent.tag, proposed: `${parent.tag}/${child.tag}`, containment };
		}
	}
	return best;
}

const byContainment = (a: ParentCandidate, b: ParentCandidate): number => b.containment - a.containment;

export function findParentCandidates(stats: TagStat[], options: TaxonomyOptions): ParentCandidate[] {
	const flat = stats.filter((s) => !s.tag.includes('/'));
	const out: ParentCandidate[] = [];
	for (const child of flat) {
		const best = bestParentFor(child, flat, options);
		if (best) out.push(best);
	}
	return out.sort(byContainment);
}

export async function findParentCandidatesAsync(
	stats: TagStat[],
	options: TaxonomyOptions,
	tick: () => Promise<void>,
): Promise<ParentCandidate[]> {
	const flat = stats.filter((s) => !s.tag.includes('/'));
	const out: ParentCandidate[] = [];
	for (const child of flat) {
		const best = bestParentFor(child, flat, options);
		if (best) out.push(best);
		await tick();
	}
	return out.sort(byContainment);
}

/** Same result as buildTaxonomy, but awaits `tick` between units of work so the UI stays responsive. */
export async function buildTaxonomyAsync(
	index: IndexData,
	tick: () => Promise<void>,
	overrides: Partial<TaxonomyOptions> = {},
): Promise<Taxonomy> {
	const options = { ...DEFAULT_TAXONOMY_OPTIONS, ...overrides };
	const stats = collectTagStats(index);
	await tick();
	return {
		stats,
		tree: buildTree(stats),
		mergeCandidates: await findMergeCandidatesAsync(stats, options, tick),
		parentCandidates: await findParentCandidatesAsync(stats, options, tick),
		pruneCandidates: stats
			.filter((s) => s.count <= options.pruneMaxCount)
			.map((s) => ({ tag: s.tag, count: s.count, notes: s.notes })),
	};
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
