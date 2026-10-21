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

/** The CLI is a separate Electron process; variables meant for the host app must not leak into it. */
export function sanitizedEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	return Object.fromEntries(Object.entries(env).filter(([key]) => !key.toUpperCase().startsWith('ELECTRON_')));
}

/** A file in the same folder as `execPath`, keeping that path's own separator style. */
function siblingOf(execPath: string, name: string): string {
	return execPath.slice(0, Math.max(execPath.lastIndexOf('/'), execPath.lastIndexOf('\\')) + 1) + name;
}

/**
 * Executables to try, in order, when no custom path is configured. The CLI ships beside the Obsidian executable,
 * so the one next to the running app is tried first; it always matches the app version. The name on PATH and the
 * locations the CLI registers itself in follow, because Obsidian launched from a desktop shortcut can have a
 * different PATH than a terminal. On Windows the name must be `obsidian.com`: a bare "obsidian" resolves to the
 * GUI Obsidian.exe, and the CLI needs the Obsidian.com terminal redirector.
 */
export function candidateBinaries(configured: string, platform: string, home: string, localAppData = '', execPath = ''): string[] {
	if (configured !== '' && configured !== DEFAULT_BINARY) return [configured];

	const candidates: string[] = [];
	if (execPath) {
		candidates.push(siblingOf(execPath, platform === 'win32' ? 'Obsidian.com' : 'obsidian-cli'));
	}
	if (platform === 'win32') {
		candidates.push(`${DEFAULT_BINARY}.com`);
		if (localAppData) candidates.push(`${localAppData}\\Programs\\Obsidian\\Obsidian.com`);
	} else {
		candidates.push(DEFAULT_BINARY);
		if (platform === 'darwin') candidates.push('/usr/local/bin/obsidian');
		if (platform === 'linux') candidates.push(`${home}/.local/bin/obsidian`);
	}
	return [...new Set(candidates)];
}

/** Runs the Obsidian CLI binary without a shell, so arguments are never interpreted. */
export class ExecFileRunner implements CommandRunner {
	constructor(
		private readonly binary: string,
		private readonly timeoutMs = 60_000,
		private readonly platform: string = process.platform,
		private readonly home: string = process.env.HOME ?? '',
		private readonly localAppData: string = process.env.LOCALAPPDATA ?? '',
		/** Working directory for the CLI; the vault folder makes the CLI target this vault by default. */
		private readonly cwd?: string,
		/** Path of the running Obsidian executable, used to locate the CLI shipped beside it. */
		private readonly execPath: string = process.execPath ?? '',
	) {}

	async run(args: string[]): Promise<string> {
		const binaries = candidateBinaries(this.binary, this.platform, this.home, this.localAppData, this.execPath);
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
				{ maxBuffer: 64 * 1024 * 1024, timeout: this.timeoutMs, windowsHide: true, cwd: this.cwd, env: sanitizedEnv(process.env) },
				(error, stdout, stderr) => {
					if (error) {
						const notFound = (error as NodeJS.ErrnoException).code === 'ENOENT';
						reject(
							new CliError(
								notFound
									? `Obsidian CLI not found at "${binary}". Enable it under Settings → General → Command line interface, or set its path in the plugin settings.`
									: `Obsidian CLI failed (${binary}, ${String((error as NodeJS.ErrnoException).code ?? 'error')}): ${stderr.trim() || stdout.trim() || error.message}`,
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
