import type { WorkerRequest, WorkerResponse } from './worker-protocol';

type Extractor = (
	texts: string[],
	options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

interface TransformersModule {
	pipeline(
		task: 'feature-extraction',
		model: string,
		options: { dtype: 'q8'; progress_callback?: (info: { status?: string; file?: string; progress?: number }) => void },
	): Promise<unknown>;
	env: { allowLocalModels: boolean; useBrowserCache: boolean };
}

/**
 * The logic that runs inside the embedding worker, kept free of worker globals so it can be tested.
 * `load` imports transformers.js; `post` sends a message back to the plugin.
 */
export function createWorkerHandler(
	load: () => Promise<TransformersModule>,
	post: (message: WorkerResponse) => void,
	cacheAvailable: () => boolean = () => typeof caches !== 'undefined',
) {
	let extractor: Promise<Extractor> | null = null;

	const getExtractor = (model: string): Promise<Extractor> => {
		extractor ??= (async () => {
			post({ type: 'log', message: `loading model ${model}` });
			const { pipeline, env } = await load();
			env.allowLocalModels = false;
			env.useBrowserCache = cacheAvailable();
			const lastReported = new Map<string, number>();
			const created = await pipeline('feature-extraction', model, {
				dtype: 'q8',
				progress_callback: (info) => {
					if (info.status !== 'progress' || !info.file) return;
					const bucket = Math.floor((info.progress ?? 0) / 25);
					if (lastReported.get(info.file) === bucket) return;
					lastReported.set(info.file, bucket);
					post({ type: 'log', message: `downloading ${info.file}: ${Math.round(info.progress ?? 0)}%` });
				},
			});
			post({ type: 'log', message: 'model ready' });
			return created as Extractor;
		})();
		return extractor;
	};

	return async (request: WorkerRequest): Promise<void> => {
		try {
			const ready = await getExtractor(request.model);
			if (request.type === 'init') {
				post({ type: 'ready', id: request.id });
				return;
			}
			const output = await ready(request.texts, { pooling: 'mean', normalize: true });
			post({ type: 'result', id: request.id, vectors: output.tolist() });
		} catch (error) {
			extractor = null; // allow a retry, e.g. after a network failure
			post({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
		}
	};
}
