import { execFile } from 'child_process';

export interface CommandRunner {
	run(args: string[]): Promise<string>;
}

export class CliError extends Error {
	constructor(
		message: string,
		readonly stderr = '',
	) {
		super(message);
		this.name = 'CliError';
	}
}

/** Runs the Obsidian CLI binary without a shell, so arguments are never interpreted. */
export class ExecFileRunner implements CommandRunner {
	constructor(
		private readonly binary: string,
		private readonly timeoutMs = 60_000,
	) {}

	run(args: string[]): Promise<string> {
		return new Promise((resolve, reject) => {
			execFile(
				this.binary,
				args,
				{ maxBuffer: 64 * 1024 * 1024, timeout: this.timeoutMs, windowsHide: true },
				(error, stdout, stderr) => {
					if (error) {
						const notFound = (error as NodeJS.ErrnoException).code === 'ENOENT';
						reject(
							new CliError(
								notFound
									? `Obsidian CLI not found at "${this.binary}". Enable the CLI in Obsidian settings or set its path in the plugin settings.`
									: `Obsidian CLI failed: ${stderr.trim() || error.message}`,
								stderr,
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
