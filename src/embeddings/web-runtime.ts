interface ProcessLike {
	release?: { name?: string };
}

const HIDDEN_NAME = 'electron-renderer';

/**
 * Obsidian's renderer reports `process.release.name === 'node'`. The web build of transformers.js trusts that:
 * it selects a Node ONNX runtime it does not bundle, defaults to the "cpu" device, and expects a filesystem.
 * That decision is made once, when the module is evaluated, so the name is hidden for exactly that moment and
 * restored immediately afterwards. The library then takes its browser path (fetch, Cache API, WASM).
 *
 * The property is read-only (but configurable), so it is redefined rather than assigned.
 */
export async function importAsWebRuntime<T>(
	load: () => Promise<T>,
	proc: ProcessLike | undefined = (globalThis as { process?: ProcessLike }).process,
): Promise<T> {
	const release = proc?.release;
	if (!release || release.name !== 'node') return load();

	const original = Object.getOwnPropertyDescriptor(release, 'name');
	try {
		Object.defineProperty(release, 'name', { ...original, value: HIDDEN_NAME });
	} catch {
		return load(); // not configurable: nothing more we can do
	}
	try {
		return await load();
	} finally {
		Object.defineProperty(release, 'name', { ...original, value: 'node' });
	}
}
