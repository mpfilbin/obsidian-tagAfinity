import { execFile } from 'child_process';

export interface CommandRunner {
	run(args: string[]): Promise<string>;
}

export class CliError extends Error {
	constructor(
		message: string,
		readonly stderr = '',
		readonly notFound = false,
	) {
		super(message);
		this.name = 'CliError';
	}
}

export const DEFAULT_BINARY = 'obsidian';

/**
 * Executables to try, in order. Obsidian launched from a desktop shortcut often lacks the directories the CLI
 * registers itself in (see the Troubleshooting section of the CLI docs), so the default name falls back to them.
 */
export function candidateBinaries(configured: string, platform: string, home: string, localAppData = ''): string[] {
	if (configured !== DEFAULT_BINARY) return [configured];
	if (platform === 'darwin') return [configured, '/usr/local/bin/obsidian'];
	if (platform === 'linux') return [configured, `${home}/.local/bin/obsidian`];
	if (platform === 'win32') {
		// A bare "obsidian" resolves to the GUI Obsidian.exe; the CLI needs the Obsidian.com terminal redirector.
		const redirector = `${DEFAULT_BINARY}.com`;
		return localAppData ? [redirector, `${localAppData}\\Programs\\Obsidian\\Obsidian.com`] : [redirector];
	}
	return [configured];
}

/** Runs the Obsidian CLI binary without a shell, so arguments are never interpreted. */
export class ExecFileRunner implements CommandRunner {
	constructor(
		private readonly binary: string,
		private readonly timeoutMs = 60_000,
		private readonly platform: string = process.platform,
		private readonly home: string = process.env.HOME ?? '',
		private readonly localAppData: string = process.env.LOCALAPPDATA ?? '',
	) {}

	async run(args: string[]): Promise<string> {
		const binaries = candidateBinaries(this.binary, this.platform, this.home, this.localAppData);
		let lastError: unknown;
		for (const binary of binaries) {
			try {
				return await this.exec(binary, args);
			} catch (error) {
				lastError = error;
				if (!(error instanceof CliError) || !error.notFound) throw error;
			}
		}
		throw lastError;
	}

	private exec(binary: string, args: string[]): Promise<string> {
		return new Promise((resolve, reject) => {
			execFile(
				binary,
				args,
				{ maxBuffer: 64 * 1024 * 1024, timeout: this.timeoutMs, windowsHide: true },
				(error, stdout, stderr) => {
					if (error) {
						const notFound = (error as NodeJS.ErrnoException).code === 'ENOENT';
						reject(
							new CliError(
								notFound
									? `Obsidian CLI not found at "${binary}". Enable it under Settings → General → Command line interface, or set its path in the plugin settings.`
									: `Obsidian CLI failed: ${stderr.trim() || error.message}`,
								stderr,
								notFound,
							),
						);
						return;
					}
					resolve(stdout);
				},
			);
		});
	}
}
