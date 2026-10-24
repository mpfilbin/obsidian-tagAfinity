import { isExcluded } from './exclude';
import { TAG_PARSER_VERSION } from '../tags/parse';
import type { IndexData } from './store';
import type { NoteStat } from './sync';

export interface IndexStatus {
	/** Notes in the vault that are not in the index yet. */
	added: string[];
	/** Indexed notes whose modification time or size differs (or was never recorded). */
	changed: string[];
	/** Indexed notes that no longer exist or are now excluded. */
	removed: string[];
	syncedAt: number | undefined;
	/** Number of notes in the index. */
	indexed: number;
	/** The stored tags were found under older detection rules; an update re-derives them (no re-embedding). */
	tagRulesOutdated: boolean;
}

/** How far the index is behind the vault, worked out from modification times alone; reads no notes. */
export function computeIndexStatus(index: IndexData, stats: Map<string, NoteStat>, exclude: string[]): IndexStatus {
	const added: string[] = [];
	const changed: string[] = [];
	const current = new Set<string>();

	for (const [path, stat] of stats) {
		if (isExcluded(path, exclude)) continue;
		current.add(path);
		const entry = index.notes[path];
		if (!entry) added.push(path);
		else if (entry.mtime !== stat.mtime || entry.size !== stat.size) changed.push(path);
	}
	const removed = Object.keys(index.notes).filter((path) => !current.has(path));
	const indexed = Object.keys(index.notes).length;
	return {
		added,
		changed,
		removed,
		syncedAt: index.syncedAt,
		indexed,
		tagRulesOutdated: indexed > 0 && index.tagsVersion !== TAG_PARSER_VERSION,
	};
}

export function pendingChanges(status: IndexStatus): number {
	return status.added.length + status.changed.length + status.removed.length + (status.tagRulesOutdated ? 1 : 0);
}

function ago(from: number, now: number): string {
	const minutes = Math.max(1, Math.round((now - from) / 60_000));
	if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
	const days = Math.round(hours / 24);
	return `${days} days ago`;
}

export function describeIndexStatus(status: IndexStatus, now: number): string {
	if (status.indexed === 0) return 'The index has not been built yet.';
	const when = status.syncedAt ? ago(status.syncedAt, now) : 'at an unknown time';
	if (status.tagRulesOutdated) {
		return `Index updated ${when}, but tag detection has improved: update the index to refresh the tags (notes are not re-embedded).`;
	}
	const total = pendingChanges(status);
	if (total === 0) return `Index is up to date (updated ${when}, ${status.indexed} notes).`;

	const parts = [
		status.changed.length > 0 ? `${status.changed.length} modified` : '',
		status.added.length > 0 ? `${status.added.length} new` : '',
		status.removed.length > 0 ? `${status.removed.length} removed` : '',
	].filter(Boolean);
	return `Index updated ${when}; ${total} ${total === 1 ? 'note' : 'notes'} changed since (${parts.join(', ')}).`;
}
