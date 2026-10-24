export interface LineChange {
	type: '-' | '+';
	/** 1-based line number in the original (for "-") or updated (for "+") text. */
	line: number;
	text: string;
}

/** Above this many table cells the line-by-line comparison would stall the UI and use too much memory. */
const MAX_LCS_CELLS = 4_000_000;

/**
 * Line diff. Tag edits touch a few lines, so the unchanged head and tail are trimmed first and only the
 * differing middle is compared (longest common subsequence). A middle too large for that is reported as
 * fully replaced rather than compared.
 */
export function diffLines(before: string, after: string): LineChange[] {
	const a = before.split('\n');
	const b = after.split('\n');

	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head++;
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

	const midA = a.slice(head, a.length - tail);
	const midB = b.slice(head, b.length - tail);
	return diffMiddle(midA, midB, head);
}

function diffMiddle(a: string[], b: string[], offset: number): LineChange[] {
	if (a.length * b.length > MAX_LCS_CELLS) {
		return [
			...a.map((text, i): LineChange => ({ type: '-', line: offset + i + 1, text })),
			...b.map((text, j): LineChange => ({ type: '+', line: offset + j + 1, text })),
		];
	}

	const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			table[i][j] =
				a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
		}
	}

	const changes: LineChange[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			i++;
			j++;
		} else if (table[i + 1][j] >= table[i][j + 1]) {
			changes.push({ type: '-', line: offset + i + 1, text: a[i] });
			i++;
		} else {
			changes.push({ type: '+', line: offset + j + 1, text: b[j] });
			j++;
		}
	}
	for (; i < a.length; i++) changes.push({ type: '-', line: offset + i + 1, text: a[i] });
	for (; j < b.length; j++) changes.push({ type: '+', line: offset + j + 1, text: b[j] });
	return changes;
}
