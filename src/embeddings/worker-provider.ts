import { log } from '../log';
import type { EmbeddingProvider } from './provider';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

/** The subset of the Web Worker API used here; lets tests substitute a fake. */
export interface WorkerLike {
	postMessage(message: WorkerRequest): void;
	terminate(): void;
	onmessage: ((event: { data: WorkerResponse }) => void) | null;
	onerror: ((event: { message?: string }) => void) | null;
}

/** The worker could not be created or its script failed to load, as opposed to a model or inference failure. */
export class WorkerStartError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WorkerStartError';
	}
}

/** Runs embedding inference in a Web Worker so the Obsidian UI stays responsive. */
export class WorkerEmbeddingProvider implements EmbeddingProvider {
	/** Large batches are efficient here because they do not block the UI. */
	readonly batchSize = 16;
	private worker: WorkerLike | null = null;
	private nextId = 1;
	private readonly pending = new Map<number, { resolve: (vectors: number[][]) => void; reject: (error: Error) => void }>();

	constructor(
		readonly id: string,
		private readonly createWorker: () => WorkerLike,
	) {}

	private start(): WorkerLike {
		if (this.worker) return this.worker;
		let worker: WorkerLike;
		try {
			worker = this.createWorker();
		} catch (error) {
			throw new WorkerStartError(`could not create the embedding worker: ${error instanceof Error ? error.message : String(error)}`);
		}
		worker.onmessage = (event) => this.handle(event.data);
		worker.onerror = (event) => {
			this.worker = null;
			this.rejectAll(new WorkerStartError(`the embedding worker failed: ${event.message ?? 'unknown error'}`));
		};
		this.worker = worker;
		log.info('worker', 'embedding worker created');
		return worker;
	}

	private handle(message: WorkerResponse): void {
		if (message.type === 'log') {
			log.info('worker', message.message);
			return;
		}
		const waiting = this.pending.get(message.id);
		if (!waiting) return;
		this.pending.delete(message.id);
		if (message.type === 'error') waiting.reject(new Error(message.message));
		else if (message.type === 'result') waiting.resolve(message.vectors);
		else waiting.resolve([]);
	}

	private rejectAll(error: Error): void {
		for (const waiting of this.pending.values()) waiting.reject(error);
		this.pending.clear();
	}

	embed(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) return Promise.resolve([]);
		let worker: WorkerLike;
		try {
			worker = this.start();
		} catch (error) {
			return Promise.reject(error instanceof Error ? error : new Error(String(error)));
		}
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			worker.postMessage({ type: 'embed', id, model: this.id, texts });
		});
	}

	dispose(): void {
		this.worker?.terminate();
		this.worker = null;
		this.rejectAll(new Error('the embedding worker was stopped'));
	}
}
