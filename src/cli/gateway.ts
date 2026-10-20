import type { CommandRunner } from './runner';

/** Everything the plugin needs from the vault. All access goes through the Obsidian CLI. */
export interface VaultGateway {
	/** Vault-relative paths of all markdown notes. */
	listNotes(): Promise<string[]>;
	readNote(path: string): Promise<string>;
	/** Replaces the note's content. */
	writeNote(path: string, content: string): Promise<void>;
}

export interface CliGatewayOptions {
	/** Passed as `vault=<name>` when set; otherwise the CLI uses its default vault. */
	vaultName?: string;
}

/**
 * Wraps the Obsidian CLI (`obsidian <command> key=value ...`).
 *
 * The command names and argument syntax below follow the CLI as documented at the time of writing and are the
 * single place to adjust if the CLI differs: `files`, `read path=`, `create path= content= overwrite`.
 */
export class CliVaultGateway implements VaultGateway {
	constructor(
		private readonly runner: CommandRunner,
		private readonly options: CliGatewayOptions = {},
	) {}

	private run(command: string, ...args: string[]): Promise<string> {
		const vault = this.options.vaultName ? [`vault=${this.options.vaultName}`] : [];
		return this.runner.run([...vault, command, ...args]);
	}

	async listNotes(): Promise<string[]> {
		const out = await this.run('files', 'ext=md');
		return out
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.toLowerCase().endsWith('.md'));
	}

	readNote(path: string): Promise<string> {
		return this.run('read', `path=${path}`);
	}

	async writeNote(path: string, content: string): Promise<void> {
		await this.run('create', `path=${path}`, `content=${encodeContent(content)}`, 'overwrite');
	}
}

/** The CLI takes content on the command line, where newlines and tabs are written as escape sequences. */
export function encodeContent(content: string): string {
	return content.replace(/\r\n/g, '\n').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}
