/** transformers.js looks for an ONNX runtime under this shared symbol before choosing one itself. */
export const ORT_SYMBOL = Symbol.for('onnxruntime');

/**
 * Obsidian's renderer reports itself as Node (`process.release.name === 'node'`), so the web build of
 * transformers.js picks its Node runtime, which that build does not contain. Registering the web runtime
 * under the shared symbol, before transformers.js is imported, makes it use that instead.
 */
export async function registerOnnxRuntime(host: Record<symbol, unknown>, load: () => Promise<unknown>): Promise<void> {
	if (ORT_SYMBOL in host) return;
	host[ORT_SYMBOL] = await load();
}
