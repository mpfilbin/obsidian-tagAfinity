import { splitFrontmatter } from '../tags/frontmatter';
import { maskNonTagRegions } from '../tags/parse';

const STOPWORDS = new Set(
	(
		'a about above after again all also am an and any are as at be because been before being below between both but by ' +
		'can could did do does doing down during each few for from further had has have having he her here hers him his how ' +
		'i if in into is it its just like may me might more most much must my no nor not of off on once one only or other ' +
		'our out over own same she should so some such than that the their them then there these they this those through to ' +
		'too under until up use used using very was we were what when where which while who whom why will with would you your ' +
		'etc via per new get got make made need needs note notes see well way ways thing things'
	).split(' '),
);

/** Strips frontmatter, code, links and tags, leaving prose suitable for embedding or keyword extraction. */
export function proseOf(content: string): string {
	const { body } = splitFrontmatter(content);
	return maskNonTagRegions(body)
		.replace(/(?<![\w#&/\\])#[\p{L}\p{N}_\-/]+/gu, ' ')
		.replace(/[#>*_~|[\]()]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function tokens(text: string): string[] {
	return (text.toLowerCase().match(/\p{L}[\p{L}\p{N}'-]*/gu) ?? [])
		.map((t) => t.replace(/^[-']+|[-']+$/g, ''))
		.filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Unigrams and adjacent bigrams (over the stopword-filtered stream). */
export function terms(text: string): string[] {
	const words = tokens(text);
	const out = [...words];
	for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]} ${words[i + 1]}`);
	return out;
}

export function slugify(term: string): string {
	return term
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}
