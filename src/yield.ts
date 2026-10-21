/** Gives the UI a turn: lets pending input and rendering run before the caller continues. */
export function yieldToUi(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Returns a function that yields to the UI on every `every`-th call and is a cheap no-op otherwise. */
export function yieldEvery(every: number, yieldFn: () => Promise<void> = yieldToUi): () => Promise<void> {
	let calls = 0;
	return async () => {
		if (++calls % every === 0) await yieldFn();
	};
}
