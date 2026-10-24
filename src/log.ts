const HISTORY_LIMIT = 500;

/**
 * Opt-in diagnostics. Nothing is written or retained while disabled. Output goes through console.log because
 * Chromium's developer console hides console.debug unless the "Verbose" level is switched on.
 */
export class Logger {
	private enabled = false;
	private readonly lines: string[] = [];
	private readonly activities: string[] = [];
	private readonly started: number;

	constructor(
		private readonly sink: (line: string) => void = (line) => console.debug(line),
		private readonly now: () => number = () => performance.now(),
	) {
		this.started = this.now();
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) this.lines.length = 0;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	info(scope: string, message: string, data?: Record<string, unknown>): void {
		if (!this.enabled) return;
		const elapsed = ((this.now() - this.started) / 1000).toFixed(1).padStart(7);
		const line = `[tagafinity:${scope}] +${elapsed}s ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
		this.lines.push(line);
		if (this.lines.length > HISTORY_LIMIT) this.lines.shift();
		this.sink(line);
	}

	history(): string[] {
		return [...this.lines];
	}

	/** What the plugin is doing right now; attached to main-thread stall reports. */
	currentActivity(): string {
		return this.activities[this.activities.length - 1] ?? 'idle';
	}

	/** Runs `work`, logging how long it took and whether it failed. Always returns or rethrows like `work`. */
	async time<T>(scope: string, label: string, work: () => Promise<T>, data?: Record<string, unknown>): Promise<T> {
		this.activities.push(`${scope}: ${label}`);
		const begin = this.now();
		this.info(scope, `${label} started`, data);
		try {
			const result = await work();
			this.info(scope, `${label} finished in ${Math.round(this.now() - begin)} ms`);
			return result;
		} catch (error) {
			this.info(scope, `${label} failed: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		} finally {
			this.activities.pop();
		}
	}
}

export const log = new Logger();
