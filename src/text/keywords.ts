import { proseOf, terms } from './tokenize';

export interface DocFrequencies {
	docCount: number;
	/** Number of notes containing each term. Terms seen in only one note are omitted. */
	docFreq: Record<string, number>;
}

export function buildDocFrequencies(contents: string[]): DocFrequencies {
	const counts = new Map<string, number>();
	for (const content of contents) {
		for (const term of new Set(terms(proseOf(content)))) {
			counts.set(term, (counts.get(term) ?? 0) + 1);
		}
	}
	const docFreq: Record<string, number> = {};
	for (const [term, count] of counts) {
		if (count >= 2) docFreq[term] = count;
	}
	return { docCount: contents.length, docFreq };
}

export interface Keyword {
	term: string;
	score: number;
}

/** Top TF-IDF terms of a note. Terms must occur at least `minTf` times in the note. */
export function extractKeywords(content: string, df: DocFrequencies, limit = 8, minTf = 2): Keyword[] {
	const counts = new Map<string, number>();
	for (const term of terms(proseOf(content))) counts.set(term, (counts.get(term) ?? 0) + 1);

	const scored: Keyword[] = [];
	for (const [term, tf] of counts) {
		if (tf < minTf) continue;
		const docs = df.docFreq[term] ?? 1;
		const idf = Math.log((df.docCount + 1) / (docs + 1)) + 1;
		const bigramBoost = term.includes(' ') ? 1.4 : 1;
		scored.push({ term, score: (1 + Math.log(tf)) * idf * bigramBoost });
	}
	return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
