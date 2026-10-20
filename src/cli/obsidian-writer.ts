import { TFile, type App } from 'obsidian';
import type { NoteWriter } from './fallback-gateway';

/** Writes through Obsidian's own file API: atomic, and exact for any content. */
export class ObsidianApiWriter implements NoteWriter {
	constructor(private readonly app: App) {}

	async writeNote(path: string, content: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`${path} is not a note in this vault.`);
		await this.app.vault.process(file, () => content);
	}
}
