import type { NoteWriter } from './fallback-gateway';
import type { VaultGateway } from './gateway';

/**
 * Reads and lists through the CLI but writes through a separate writer. Sending a whole note to the CLI as a
 * command argument can crash Obsidian itself (its main process parses each chunk of an incoming CLI message as
 * complete JSON, which fails when a long message is split), so writes do not go through the CLI by default.
 */
export class ReadWriteGateway implements VaultGateway {
	constructor(
		private readonly cli: VaultGateway,
		private readonly writer: NoteWriter,
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

	writeNote(path: string, content: string): Promise<void> {
		return this.writer.writeNote(path, content);
	}
}
