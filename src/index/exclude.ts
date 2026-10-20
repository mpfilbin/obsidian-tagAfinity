/** One pattern per line. "*.ext" matches by suffix; anything else is a folder (or exact path) prefix. */
export function parseExcludePatterns(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim().replace(/\/+$/, ''))
		.filter((line) => line !== '');
}

export function isExcluded(path: string, patterns: string[]): boolean {
	const lower = path.toLowerCase();
	return patterns.some((pattern) => {
		const p = pattern.toLowerCase();
		if (p.startsWith('*')) return lower.endsWith(p.slice(1));
		return lower === p || lower.startsWith(p + '/');
	});
}
