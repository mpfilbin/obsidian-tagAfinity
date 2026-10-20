export interface LineChange {
	type: '-' | '+';
	/** 1-based line number in the original (for "-") or updated (for "+") text. */
	line: number;
	text: string;
}

/** Line diff based on longest common subsequence. Intended for small notes, so it is O(n*m). */
export function diffLines(before: string, after: string): LineChange[] {
	const a = before.split('\n');
	const b = after.split('\n');
	const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			table[i]![j] =
				a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
		}
	}

	const changes: LineChange[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			i++;
			j++;
		} else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
			changes.push({ type: '-', line: i + 1, text: a[i]! });
			i++;
		} else {
			changes.push({ type: '+', line: j + 1, text: b[j]! });
			j++;
		}
	}
	for (; i < a.length; i++) changes.push({ type: '-', line: i + 1, text: a[i]! });
	for (; j < b.length; j++) changes.push({ type: '+', line: j + 1, text: b[j]! });
	return changes;
}
