/** Key under which spelling variants of the same tag collapse: case, hyphen/underscore, simple plural. */
export function canonicalKey(tag: string): string {
	return tag
		.toLowerCase()
		.split('/')
		.map((segment) => {
			const squashed = segment.replace(/[-_\s]+/g, '');
			return squashed.length > 3 && squashed.endsWith('s') && !squashed.endsWith('ss')
				? squashed.slice(0, -1)
				: squashed;
		})
		.join('/');
}

export function levenshteinRatio(a: string, b: string): number {
	if (a === b) return 1;
	if (a.length === 0 || b.length === 0) return 0;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) {
			row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
		}
		prev = row;
	}
	return 1 - prev[b.length]! / Math.max(a.length, b.length);
}

/** True when `short` is made of the initial letters of the words in `long` (ml ↔ machine-learning). */
export function isAbbreviation(short: string, long: string): boolean {
	const words = long.toLowerCase().split(/[-_\s/]+/).filter(Boolean);
	if (words.length < 2) return false;
	return short.toLowerCase().replace(/[-_\s]/g, '') === words.map((w) => w[0]).join('');
}
