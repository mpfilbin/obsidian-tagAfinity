import { describe, it, expect } from 'vitest';
import { importAsWebRuntime } from '../../src/embeddings/web-runtime';

describe('importAsWebRuntime', () => {
	describe('when the host reports itself as node', () => {
		it('hides that while the module loads', async () => {
			const proc = { release: { name: 'node' } };
			let seen = '';
			await importAsWebRuntime(() => {
				seen = proc.release.name;
				return Promise.resolve(1);
			}, proc);
			expect(seen).toBe('electron-renderer');
		});

		it('restores the original name afterwards', async () => {
			const proc = { release: { name: 'node' } };
			await importAsWebRuntime(() => Promise.resolve(1), proc);
			expect(proc.release.name).toBe('node');
		});

		it('restores the original name when loading fails', async () => {
			const proc = { release: { name: 'node' } };
			await importAsWebRuntime(() => Promise.reject(new Error('boom')), proc).catch(() => undefined);
			expect(proc.release.name).toBe('node');
		});

		it('returns what the loader returns', async () => {
			expect(await importAsWebRuntime(() => Promise.resolve('module'), { release: { name: 'node' } })).toBe('module');
		});
	});

	describe('when the release name cannot be changed', () => {
		it('still loads the module', async () => {
			const release = Object.freeze({ name: 'node' });
			expect(await importAsWebRuntime(() => Promise.resolve('module'), { release })).toBe('module');
		});
	});

	describe('when there is no process object', () => {
		it('just loads the module', async () => {
			expect(await importAsWebRuntime(() => Promise.resolve('module'), undefined)).toBe('module');
		});
	});
});
