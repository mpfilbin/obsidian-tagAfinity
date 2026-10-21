import { describe, it, expect } from 'vitest';
import { TFile, type FakeCache } from 'obsidian';
import type { App } from 'obsidian';
import { ObsidianVaultGateway } from '../../src/vault/obsidian-gateway';

function fakeApp(notes: Record<string, { content: string; tags?: string[] }>) {
	const files = Object.keys(notes).map((path) => new TFile(path));
	const contents = new Map(Object.entries(notes).map(([path, n]) => [path, n.content]));
	const folder = { path: 'Folder' };
	const app = {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (path: string) => (path === 'Folder' ? folder : (files.find((f) => f.path === path) ?? null)),
			read: (file: TFile) => Promise.resolve(contents.get(file.path) ?? ''),
			process: (file: TFile, fn: (data: string) => string) => {
				const next = fn(contents.get(file.path) ?? '');
				contents.set(file.path, next);
				return Promise.resolve(next);
			},
		},
		metadataCache: {
			getFileCache: (file: TFile): FakeCache => ({ tags: notes[file.path]?.tags }),
		},
	};
	return { app: app as unknown as App, contents };
}

describe('ObsidianVaultGateway', () => {
	describe('listNotes', () => {
		it('returns the path of every markdown note', async () => {
			const { app } = fakeApp({ 'a.md': { content: '' }, 'sub/b.md': { content: '' } });
			expect(await new ObsidianVaultGateway(app).listNotes()).toEqual(['a.md', 'sub/b.md']);
		});
	});

	describe('readNote', () => {
		it('returns the note content', async () => {
			const { app } = fakeApp({ 'a.md': { content: 'hello \\ world' } });
			expect(await new ObsidianVaultGateway(app).readNote('a.md')).toBe('hello \\ world');
		});

		describe('when the note does not exist', () => {
			it('rejects', async () => {
				const { app } = fakeApp({});
				await expect(new ObsidianVaultGateway(app).readNote('missing.md')).rejects.toThrow('not a note');
			});
		});

		describe('when the path is a folder', () => {
			it('rejects', async () => {
				const { app } = fakeApp({});
				await expect(new ObsidianVaultGateway(app).readNote('Folder')).rejects.toThrow('not a note');
			});
		});
	});

	describe('writeNote', () => {
		it('replaces the note content exactly, backslashes and all', async () => {
			const { app, contents } = fakeApp({ 'a.md': { content: 'old' } });
			await new ObsidianVaultGateway(app).writeNote('a.md', 'new \\theta\r\n\tline');
			expect(contents.get('a.md')).toBe('new \\theta\r\n\tline');
		});

		describe('when the note does not exist', () => {
			it('rejects', async () => {
				const { app } = fakeApp({});
				await expect(new ObsidianVaultGateway(app).writeNote('missing.md', 'x')).rejects.toThrow('not a note');
			});
		});
	});

	describe('notesWithTag', () => {
		const notes = {
			'a.md': { content: '', tags: ['#ml', '#python'] },
			'b.md': { content: '', tags: ['#ML/nlp'] },
			'c.md': { content: '', tags: ['#mlops'] },
			'd.md': { content: '' },
		};

		it('matches a tag case-insensitively', async () => {
			const { app } = fakeApp(notes);
			expect(await new ObsidianVaultGateway(app).notesWithTag('ml')).toContain('a.md');
		});

		it('includes notes with nested child tags', async () => {
			const { app } = fakeApp(notes);
			expect(await new ObsidianVaultGateway(app).notesWithTag('ml')).toContain('b.md');
		});

		it('does not match tags that merely share a prefix', async () => {
			const { app } = fakeApp(notes);
			expect(await new ObsidianVaultGateway(app).notesWithTag('ml')).not.toContain('c.md');
		});

		it('ignores notes without tags', async () => {
			const { app } = fakeApp(notes);
			expect(await new ObsidianVaultGateway(app).notesWithTag('ml')).not.toContain('d.md');
		});

		it('accepts a leading hash', async () => {
			const { app } = fakeApp(notes);
			expect(await new ObsidianVaultGateway(app).notesWithTag('#python')).toEqual(['a.md']);
		});
	});
});
