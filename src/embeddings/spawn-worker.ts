import type { WorkerLike } from './worker-provider';

/** Starts the embedding worker from its bundled source (a Blob URL, since a plugin ships as a single file). */
export function spawnEmbeddingWorker(source: string): WorkerLike {
	const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
	const worker = new Worker(url);
	const adapter: WorkerLike = {
		postMessage: (message) => worker.postMessage(message),
		terminate: () => {
			worker.terminate();
			URL.revokeObjectURL(url);
		},
		onmessage: null,
		onerror: null,
	};
	worker.onmessage = (event: MessageEvent) => adapter.onmessage?.({ data: event.data });
	worker.onerror = (event: ErrorEvent) => adapter.onerror?.({ message: event.message });
	return adapter;
}
