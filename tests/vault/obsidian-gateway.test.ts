import { describe, it, expect } from 'vitest';
import { TFile, type FakeCache } from 'obsidian';
import type { App } from 'obsidian';
import { ObsidianVaultGateway } from '../../src/vault/obsidian-gateway';

function fakeApp(notes: Record<string, { content: string; tags?: string[] }>) {
	const files = Object.keys(notes).map((path) => new TFile(path));
	const contents = new Map(Object.entries(notes).map(([path, n]) => [path, n.content]));
	const folders = new Set(['Folder']);
	const created: string[] = [];
	const app = {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (path: string) => (folders.has(path) ? { path } : (files.find((f) => f.path === path) ?? null)),
			createFolder: (path: string) => {
				folders.add(path);
				created.push(`folder:${path}`);
				return Promise.resolve();
			},
			create: (path: string, content: string) => {
				files.push(new TFile(path));
				contents.set(path, content);
				created.push(`file:${path}`);
				return Promise.resolve();
			},
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
	return { app: app as unknown as App, contents, created };
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

	describe('noteExists', () => {
		it('is true for a note', async () => {
			const { app } = fakeApp({ 'a.md': { content: '' } });
			expect(await new ObsidianVaultGateway(app).noteExists('a.md')).toBe(true);
		});

		it('is false for a missing path', async () => {
			const { app } = fakeApp({});
			expect(await new ObsidianVaultGateway(app).noteExists('missing.md')).toBe(false);
		});

		it('is false for a folder', async () => {
			const { app } = fakeApp({});
			expect(await new ObsidianVaultGateway(app).noteExists('Folder')).toBe(false);
		});
	});

	describe('createNote', () => {
		describe('when the path is already taken', () => {
			it('rejects', async () => {
				const { app } = fakeApp({ 'a.md': { content: '' } });
				await expect(new ObsidianVaultGateway(app).createNote('a.md', 'x')).rejects.toThrow('already exists');
			});
		});

		describe('when the note is at the vault root', () => {
			it('creates it with the content', async () => {
				const { app, contents } = fakeApp({});
				await new ObsidianVaultGateway(app).createNote('new.md', 'hello');
				expect(contents.get('new.md')).toBe('hello');
			});

			it('creates no folder', async () => {
				const { app, created } = fakeApp({});
				await new ObsidianVaultGateway(app).createNote('new.md', 'hello');
				expect(created).toEqual(['file:new.md']);
			});
		});

		describe('when the folder is missing', () => {
			it('creates the folder before the note', async () => {
				const { app, created } = fakeApp({});
				await new ObsidianVaultGateway(app).createNote('Meta/new.md', 'hello');
				expect(created).toEqual(['folder:Meta', 'file:Meta/new.md']);
			});
		});

		describe('when the folder exists', () => {
			it('does not create it again', async () => {
				const { app, created } = fakeApp({});
				await new ObsidianVaultGateway(app).createNote('Folder/new.md', 'hello');
				expect(created).toEqual(['file:Folder/new.md']);
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
