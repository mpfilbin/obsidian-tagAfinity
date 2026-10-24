// Entry point of the embedding worker. Bundled separately and embedded into the plugin as a string (see esbuild.config.mjs).
import { createWorkerHandler } from './worker-core';
import { importAsWebRuntime } from './web-runtime';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

// Electron can expose Node's `process` inside workers, which makes transformers.js pick a Node runtime its web
// build does not contain; importAsWebRuntime hides that for the moment the library is evaluated.
const handle = createWorkerHandler(
	() => importAsWebRuntime(() => import('@huggingface/transformers')),
	(message: WorkerResponse) => self.postMessage(message),
);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
	void handle(event.data);
};
