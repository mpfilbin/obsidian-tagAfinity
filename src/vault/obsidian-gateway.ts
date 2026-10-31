import { TFile, getAllTags, type App } from 'obsidian';
import type { VaultGateway } from './gateway';

/**
 * Vault access through Obsidian's own API. Reads come straight from the vault (no process per note), writes use
 * `Vault.process`, which is atomic and exact for any content, and tag lookups use Obsidian's metadata cache.
 */
export class ObsidianVaultGateway implements VaultGateway {
	constructor(private readonly app: App) {}

	private note(path: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`${path} is not a note in this vault.`);
		return file;
	}

	listNotes(): Promise<string[]> {
		return Promise.resolve(this.app.vault.getMarkdownFiles().map((file) => file.path));
	}

	async readNote(path: string): Promise<string> {
		return this.app.vault.read(this.note(path));
	}

	noteExists(path: string): Promise<boolean> {
		return Promise.resolve(this.app.vault.getAbstractFileByPath(path) instanceof TFile);
	}

	async createNote(path: string, content: string): Promise<void> {
		if (this.app.vault.getAbstractFileByPath(path)) throw new Error(`${path} already exists in this vault.`);
		const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
		if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		await this.app.vault.create(path, content);
	}

	async writeNote(path: string, content: string): Promise<void> {
		await this.app.vault.process(this.note(path), () => content);
	}

	notesWithTag(tag: string): Promise<string[]> {
		const wanted = tag.replace(/^#/, '').toLowerCase();
		const paths: string[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = (cache ? getAllTags(cache) : null) ?? [];
			const matches = tags.some((t) => {
				const lower = t.replace(/^#/, '').toLowerCase();
				return lower === wanted || lower.startsWith(wanted + '/');
			});
			if (matches) paths.push(file.path);
		}
		return Promise.resolve(paths);
	}
}
