interface ProcessLike {
	release?: { name?: string };
}

/**
 * Obsidian's renderer reports `process.release.name === 'node'`. The web build of transformers.js trusts that:
 * it selects a Node ONNX runtime it does not bundle, defaults to the "cpu" device, and expects a filesystem.
 * That decision is made once, when the module is evaluated, so the name is hidden for exactly that moment and
 * restored immediately afterwards. The library then takes its browser path (fetch, Cache API, WASM).
 */
export async function importAsWebRuntime<T>(
	load: () => Promise<T>,
	proc: ProcessLike | undefined = (globalThis as { process?: ProcessLike }).process,
): Promise<T> {
	const release = proc?.release;
	if (!release || release.name !== 'node') return load();

	const original = release.name;
	try {
		release.name = 'electron-renderer';
	} catch {
		return load(); // read-only: nothing more we can do
	}
	try {
		return await load();
	} finally {
		release.name = original;
	}
}
