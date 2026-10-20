import { describe, it, expect } from 'vitest';
import { Logger } from '../src/log';

function logger(enabled: boolean): { log: Logger; lines: string[] } {
	const lines: string[] = [];
	const log = new Logger((line) => lines.push(line), () => 1000);
	log.setEnabled(enabled);
	return { log, lines };
}

describe('Logger', () => {
	describe('when disabled', () => {
		it('writes nothing', () => {
			const { log, lines } = logger(false);
			log.info('index', 'started');
			expect(lines).toEqual([]);
		});

		it('does not keep history', () => {
			const { log } = logger(false);
			log.info('index', 'started');
			expect(log.history()).toEqual([]);
		});

		it('still runs timed work and returns its result', async () => {
			const { log } = logger(false);
			expect(await log.time('index', 'work', () => Promise.resolve(7))).toBe(7);
		});
	});

	describe('when enabled', () => {
		it('prefixes lines with the scope', () => {
			const { log, lines } = logger(true);
			log.info('cli', 'read a.md');
			expect(lines[0]).toContain('[tagafinity:cli]');
		});

		it('appends structured data', () => {
			const { log, lines } = logger(true);
			log.info('cli', 'read', { path: 'a.md' });
			expect(lines[0]).toContain('{"path":"a.md"}');
		});

		it('keeps lines in the history', () => {
			const { log } = logger(true);
			log.info('cli', 'one');
			expect(log.history()).toHaveLength(1);
		});

		it('bounds the history', () => {
			const { log } = logger(true);
			for (let i = 0; i < 700; i++) log.info('cli', `line ${i}`);
			expect(log.history()).toHaveLength(500);
		});

		it('logs the duration of timed work', async () => {
			const lines: string[] = [];
			let now = 0;
			const log = new Logger((l) => lines.push(l), () => now);
			log.setEnabled(true);
			await log.time('embed', 'batch', async () => {
				now += 250;
			});
			expect(lines[lines.length - 1]).toContain('250 ms');
		});

		it('logs a failure and rethrows it', async () => {
			const { log, lines } = logger(true);
			await expect(log.time('embed', 'batch', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
			expect(lines[lines.length - 1]).toContain('failed: boom');
		});
	});

	describe('activity', () => {
		it('reports the current activity while timed work runs', async () => {
			const { log } = logger(true);
			let seen = '';
			await log.time('index', 'syncing', async () => {
				seen = log.currentActivity();
			});
			expect(seen).toBe('index: syncing');
		});

		it('clears the activity afterwards', async () => {
			const { log } = logger(true);
			await log.time('index', 'syncing', () => Promise.resolve());
			expect(log.currentActivity()).toBe('idle');
		});
	});
});
