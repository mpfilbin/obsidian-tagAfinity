export type IndexPhase = 'preparing' | 'reading' | 'embedding' | 'finishing';

export interface IndexProgress {
	phase: IndexPhase;
	done: number;
	total: number;
}

export function describeProgress(progress: IndexProgress): string {
	switch (progress.phase) {
		case 'preparing':
			return 'Loading the embedding model…';
		case 'reading':
			return progress.total === 0
				? 'Checking for changed notes…'
				: `Reading changed notes: ${progress.done} of ${progress.total}…`;
		case 'embedding':
			return `Embedding notes: ${progress.done} of ${progress.total}…`;
		case 'finishing':
			return 'Finishing up…';
	}
}

/** Completed share of the current step, 0 to 1, or undefined when the step has no known size. */
export function progressFraction(progress: IndexProgress): number | undefined {
	if (progress.total <= 0) return undefined;
	return Math.min(1, progress.done / progress.total);
}
