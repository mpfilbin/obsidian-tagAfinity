import { log } from '../log';
import { UnsupportedContentError, type VaultGateway } from './gateway';

/** Writes a note's full content by some means other than the CLI. */
export interface NoteWriter {
	writeNote(path: string, content: string): Promise<void>;
}

/**
 * Reads and lists through the CLI, and writes through the CLI too, except for notes the CLI cannot carry
 * faithfully (backslashes, very large notes), which are written through the fallback instead.
 */
export class FallbackWriteGateway implements VaultGateway {
	constructor(
		private readonly cli: VaultGateway,
		private readonly fallback: NoteWriter,
	) {}

	listNotes(): Promise<string[]> {
		return this.cli.listNotes();
	}

	readNote(path: string): Promise<string> {
		return this.cli.readNote(path);
	}

	notesWithTag(tag: string): Promise<string[]> {
		return this.cli.notesWithTag(tag);
	}

	async writeNote(path: string, content: string): Promise<void> {
		try {
			await this.cli.writeNote(path, content);
		} catch (error) {
			if (!(error instanceof UnsupportedContentError)) throw error;
			log.info('cli', `${error.message} Writing it through the Obsidian API instead.`);
			await this.fallback.writeNote(path, content);
		}
	}
}
