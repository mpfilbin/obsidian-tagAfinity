import { describe, it, expect } from 'vitest';
import { computeIndexStatus, describeIndexStatus } from '../../src/index/status';
import { emptyIndex, type IndexData } from '../../src/index/store';

function index(notes: Record<string, { mtime?: number; size?: number }>, syncedAt?: number): IndexData {
	const out = emptyIndex('m');
	out.syncedAt = syncedAt;
	for (const [path, stat] of Object.entries(notes)) out.notes[path] = { hash: 'h', vector: [1], tags: [], ...stat };
	return out;
}
const stats = (entries: Record<string, [number, number]>) => new Map(Object.entries(entries).map(([p, [mtime, size]]) => [p, { mtime, size }]));

describe('computeIndexStatus', () => {
	describe('when nothing changed', () => {
		it('reports an up to date index', () => {
			const status = computeIndexStatus(index({ 'a.md': { mtime: 1, size: 10 } }), stats({ 'a.md': [1, 10] }), []);
			expect(status).toMatchObject({ added: [], changed: [], removed: [] });
		});
	});

	describe('when a note was modified', () => {
		it('lists it as changed', () => {
			const status = computeIndexStatus(index({ 'a.md': { mtime: 1, size: 10 } }), stats({ 'a.md': [2, 10] }), []);
			expect(status.changed).toEqual(['a.md']);
		});
	});

	describe('when only the size differs', () => {
		it('lists it as changed', () => {
			const status = computeIndexStatus(index({ 'a.md': { mtime: 1, size: 10 } }), stats({ 'a.md': [1, 11] }), []);
			expect(status.changed).toEqual(['a.md']);
		});
	});

	describe('when a note is new', () => {
		it('lists it as added', () => {
			expect(computeIndexStatus(index({}), stats({ 'new.md': [1, 1] }), []).added).toEqual(['new.md']);
		});
	});

	describe('when a note was deleted', () => {
		it('lists it as removed', () => {
			expect(computeIndexStatus(index({ 'gone.md': { mtime: 1, size: 1 } }), stats({}), []).removed).toEqual(['gone.md']);
		});
	});

	describe('when an indexed note has no recorded modification time', () => {
		it('treats it as changed so it gets verified', () => {
			expect(computeIndexStatus(index({ 'a.md': {} }), stats({ 'a.md': [1, 1] }), []).changed).toEqual(['a.md']);
		});
	});

	describe('when a changed note matches an exclude pattern', () => {
		it('ignores it', () => {
			const status = computeIndexStatus(index({}), stats({ 'Map.excalidraw.md': [1, 1] }), ['*.excalidraw.md']);
			expect(status.added).toEqual([]);
		});
	});

	describe('when an excluded note is still in the index', () => {
		it('lists it as removed', () => {
			const status = computeIndexStatus(index({ 'Map.excalidraw.md': { mtime: 1, size: 1 } }), stats({ 'Map.excalidraw.md': [1, 1] }), ['*.excalidraw.md']);
			expect(status.removed).toEqual(['Map.excalidraw.md']);
		});
	});
});

describe('describeIndexStatus', () => {
	const now = new Date('2026-10-20T12:00:00Z').getTime();

	describe('when the index has never been built', () => {
		it('says so', () => {
			expect(describeIndexStatus({ added: [], changed: [], removed: [], syncedAt: undefined, indexed: 0 }, now)).toBe('The index has not been built yet.');
		});
	});

	describe('when notes changed since the last update', () => {
		it('summarizes the changes and the age', () => {
			const text = describeIndexStatus({ added: ['a'], changed: ['b', 'c'], removed: [], syncedAt: now - 3 * 3600_000, indexed: 700 }, now);
			expect(text).toBe('Index updated 3 hours ago; 3 notes changed since (2 modified, 1 new).');
		});
	});

	describe('when nothing changed', () => {
		it('says it is up to date', () => {
			expect(describeIndexStatus({ added: [], changed: [], removed: [], syncedAt: now - 60_000, indexed: 700 }, now)).toBe('Index is up to date (updated 1 minute ago, 700 notes).');
		});
	});
});
