/** Everything the plugin needs from the vault. */
export interface VaultGateway {
	/** Vault-relative paths of all markdown notes. */
	listNotes(): Promise<string[]>;
	readNote(path: string): Promise<string>;
	/** True when a note exists at the vault-relative path. */
	noteExists(path: string): Promise<boolean>;
	/** Creates a new note, along with any missing folders. Fails if the path is already taken. */
	createNote(path: string, content: string): Promise<void>;
	/** Replaces the note's content. */
	writeNote(path: string, content: string): Promise<void>;
	/** Paths of notes carrying the tag or any of its nested children. */
	notesWithTag(tag: string): Promise<string[]>;
}
