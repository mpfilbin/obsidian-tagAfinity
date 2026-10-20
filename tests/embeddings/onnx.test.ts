import { describe, it, expect } from 'vitest';
import { ORT_SYMBOL, registerOnnxRuntime } from '../../src/embeddings/onnx';

describe('registerOnnxRuntime', () => {
	describe('when no runtime is registered', () => {
		it('registers the loaded runtime under the shared symbol', async () => {
			const host: Record<symbol, unknown> = {};
			const runtime = { InferenceSession: {} };
			await registerOnnxRuntime(host, () => Promise.resolve(runtime));
			expect(host[ORT_SYMBOL]).toBe(runtime);
		});
	});

	describe('when a runtime is already registered', () => {
		it('keeps it and does not load another', async () => {
			const existing = { InferenceSession: {} };
			const host: Record<symbol, unknown> = { [ORT_SYMBOL]: existing };
			let loads = 0;
			await registerOnnxRuntime(host, () => {
				loads++;
				return Promise.resolve({});
			});
			expect(loads).toBe(0);
		});
	});
});
