import { describe, it, expect } from 'vitest';
import { Logger } from '../src/log';
import { startStallMonitor, type StallObserverCtor } from '../src/stall-monitor';

class FakeObserver {
	static last: FakeObserver | null = null;
	disconnected = false;
	constructor(private readonly callback: (list: { getEntries(): { duration: number }[] }) => void) {
		FakeObserver.last = this;
	}
	observe(): void {}
	disconnect(): void {
		this.disconnected = true;
	}
	emit(...durations: number[]): void {
		this.callback({ getEntries: () => durations.map((duration) => ({ duration })) });
	}
}

function setup(thresholdMs = 100) {
	const lines: string[] = [];
	const log = new Logger((l) => lines.push(l));
	log.setEnabled(true);
	const stop = startStallMonitor(log, thresholdMs, FakeObserver as unknown as StallObserverCtor);
	return { lines, stop, observer: () => FakeObserver.last! };
}

describe('startStallMonitor', () => {
	describe('when the main thread was blocked longer than the threshold', () => {
		it('logs the duration', () => {
			const { lines, observer } = setup();
			observer().emit(350);
			expect(lines[lines.length - 1]).toContain('blocked the main thread for 350 ms');
		});

		it('names what the plugin was doing', async () => {
			const lines: string[] = [];
			const log = new Logger((l) => lines.push(l));
			log.setEnabled(true);
			startStallMonitor(log, 100, FakeObserver as unknown as StallObserverCtor);
			await log.time('embed', 'batch of 16', async () => FakeObserver.last!.emit(900));
			expect(lines.find((l) => l.includes('blocked'))).toContain('embed: batch of 16');
		});
	});

	describe('when the block was shorter than the threshold', () => {
		it('logs nothing', () => {
			const { lines, observer } = setup(100);
			observer().emit(60);
			expect(lines).toEqual([]);
		});
	});

	describe('when stopped', () => {
		it('disconnects the observer', () => {
			const { stop, observer } = setup();
			stop();
			expect(observer().disconnected).toBe(true);
		});
	});

	describe('when long task observation is unsupported', () => {
		it('does nothing and returns a no-op stop', () => {
			const broken = class {
				constructor() {
					throw new Error('unsupported');
				}
			} as unknown as StallObserverCtor;
			expect(() => startStallMonitor(new Logger(), 100, broken)()).not.toThrow();
		});
	});
});
