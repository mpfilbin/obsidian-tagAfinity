// Entry point of the embedding worker. Bundled separately and embedded into the plugin as a string (see esbuild.config.mjs).
import { createWorkerHandler } from './worker-core';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

const handle = createWorkerHandler(
	() => import('@huggingface/transformers') as unknown as ReturnType<Parameters<typeof createWorkerHandler>[0]>,
	(message: WorkerResponse) => self.postMessage(message),
);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
	void handle(event.data);
};
