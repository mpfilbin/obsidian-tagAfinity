import { log } from '../log';
import { CliError, type CommandRunner } from './runner';

/** Everything the plugin needs from the vault. All access goes through the Obsidian CLI. */
export interface VaultGateway {
	/** Vault-relative paths of all markdown notes. */
	listNotes(): Promise<string[]>;
	readNote(path: string): Promise<string>;
	/** Replaces the note's content. */
	writeNote(path: string, content: string): Promise<void>;
	/** Paths of notes carrying the tag, as reported by Obsidian itself. */
	notesWithTag(tag: string): Promise<string[]>;
}

/** The note's content cannot be passed through the CLI faithfully (backslash escapes, command-line length). */
export class UnsupportedContentError extends CliError {
	constructor(message: string) {
		super(message);
		this.name = 'UnsupportedContentError';
	}
}

export interface CliGatewayOptions {
	/** Passed as `vault=<name>` when set; otherwise the CLI uses its default vault. */
	vaultName?: string;
	/** Longest encoded note content that fits on a command line. Defaults to a conservative per-platform value. */
	maxContentLength?: number;
	/** Pause before retrying a command that could not reach the running app. */
	retryDelayMs?: number;
}

/** Windows limits a whole command line to 32,767 characters; POSIX limits a single argument to 128 KiB. */
const MAX_ATTEMPTS = 3;

const DEFAULT_MAX_CONTENT = process.platform === 'win32' ? 30_000 : 120_000;

/**
 * Wraps the Obsidian CLI (`obsidian <command> key=value ...`).
 *
 * Commands used (https://obsidian.md/help/cli): `files ext=md`, `read path=`, `tag name= verbose` and
 * `create path= content= overwrite`. Content is passed as a command-line argument in which `\n` and `\t` are
 * escape sequences, so notes containing a backslash cannot be written safely and are refused.
 */
export class CliVaultGateway implements VaultGateway {
	constructor(
		private readonly runner: CommandRunner,
		private readonly options: CliGatewayOptions = {},
	) {}

	private async run(command: string, ...args: string[]): Promise<string> {
		const vault = this.options.vaultName ? [`vault=${this.options.vaultName}`] : [];
		const delay = this.options.retryDelayMs ?? 400;
		for (let attempt = 1; ; attempt++) {
			const started = performance.now();
			try {
				const output = await this.runner.run([...vault, command, ...args]);
				const ms = Math.round(performance.now() - started);
				// Reads happen hundreds of times during indexing; only report the slow ones.
				if (command !== 'read' || ms > 1000) {
					log.info('cli', `${command} ${describeArgs(args)} -> ${output.length} chars in ${ms} ms${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
				}
				// The CLI reports some failures on stdout with a success exit code.
				if (/^Error:/i.test(output.trimStart())) throw new CliError(output.trim());
				return output;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				log.info('cli', `${command} ${describeArgs(args)} failed after ${Math.round(performance.now() - started)} ms (attempt ${attempt}): ${message}`);
				// The app occasionally cannot be reached for a moment, e.g. when commands overlap.
				if (attempt < MAX_ATTEMPTS && /unable to find obsidian/i.test(message)) {
					await new Promise((resolve) => setTimeout(resolve, delay * attempt));
					continue;
				}
				throw new CliError(`${command} failed: ${message}`, error instanceof CliError ? error.stderr : '');
			}
		}
	}

	/** Obsidian's version string; a cheap way to check that the CLI can reach the app. */
	async version(): Promise<string> {
		return (await this.run('version')).trim();
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
		if (content.includes('\\')) {
			throw new UnsupportedContentError(`${path} contains a backslash, which cannot be passed safely through the CLI.`);
		}
		const encoded = encodeContent(content);
		if (encoded.length > (this.options.maxContentLength ?? DEFAULT_MAX_CONTENT)) {
			throw new UnsupportedContentError(`${path} is too large to pass through the CLI command line.`);
		}
		await this.run('create', `path=${path}`, `content=${encoded}`, 'overwrite');
	}

	async notesWithTag(tag: string): Promise<string[]> {
		const out = await this.run('tag', `name=${tag.replace(/^#/, '')}`, 'verbose');
		return out
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.toLowerCase().endsWith('.md'));
	}
}

/** Arguments for logging: note content is summarized, never printed. */
function describeArgs(args: string[]): string {
	return args.map((arg) => (arg.startsWith('content=') ? `content=<${arg.length - 8} chars>` : arg)).join(' ');
}

/** The CLI takes content on the command line, where newlines and tabs are written as escape sequences. */
export function encodeContent(content: string): string {
	return content.replace(/\r\n/g, '\n').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}
