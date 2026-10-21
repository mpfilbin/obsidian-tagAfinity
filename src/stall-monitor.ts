import type { Logger } from './log';

interface StallEntryList {
	getEntries(): { duration: number }[];
}

export interface StallObserver {
	observe(options: { entryTypes: string[] }): void;
	disconnect(): void;
}

export type StallObserverCtor = new (callback: (list: StallEntryList) => void) => StallObserver;

/**
 * Reports stretches where the main thread was blocked ("long tasks"), together with what the plugin was doing at
 * the time. The report arrives after the block ends, so it names the activity that was running then.
 * Returns a function that stops observing.
 */
export function startStallMonitor(
	log: Logger,
	thresholdMs = 100,
	Observer: StallObserverCtor | undefined = (globalThis as { PerformanceObserver?: StallObserverCtor }).PerformanceObserver,
): () => void {
	if (!Observer) return () => undefined;
	try {
		const observer = new Observer((list) => {
			for (const entry of list.getEntries()) {
				if (entry.duration >= thresholdMs) {
					log.info('stall', `blocked the main thread for ${Math.round(entry.duration)} ms (plugin activity: ${log.currentActivity()})`);
				}
			}
		});
		observer.observe({ entryTypes: ['longtask'] });
		return () => observer.disconnect();
	} catch {
		return () => undefined;
	}
}
