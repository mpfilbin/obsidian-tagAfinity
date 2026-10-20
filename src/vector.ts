export function normalize(vector: number[]): number[] {
	let sum = 0;
	for (const v of vector) sum += v * v;
	const norm = Math.sqrt(sum);
	return norm === 0 ? vector.slice() : vector.map((v) => v / norm);
}

/** Dot product; equals cosine similarity for normalized vectors. */
export function dot(a: number[], b: number[]): number {
	const n = Math.min(a.length, b.length);
	let sum = 0;
	for (let i = 0; i < n; i++) sum += a[i]! * b[i]!;
	return sum;
}

export function centroid(vectors: number[][]): number[] {
	if (vectors.length === 0) return [];
	const out = new Array<number>(vectors[0]!.length).fill(0);
	for (const v of vectors) {
		for (let i = 0; i < out.length; i++) out[i]! += v[i] ?? 0;
	}
	return normalize(out);
}
