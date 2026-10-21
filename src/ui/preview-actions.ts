import { Notice, type App } from 'obsidian';
import { planTagChange } from '../cleanup/plan';
import { affectedNotes, type TagAction } from '../cleanup/tag-actions';
import type Tagafinity from '../main';
import { composeMappers } from '../tags/transform';
import { collectTagStats } from '../taxonomy/build';
import { PreviewModal } from './preview-modal';

/** `1 change` / `3 changes: A; B; C` / `5 changes: A; B; C; …` */
export function describeActions(actions: TagAction[]): string {
	if (actions.length === 1) return actions[0]!.description;
	const shown = actions.slice(0, 3).map((a) => a.description).join('; ');
	return `${actions.length} changes: ${shown}${actions.length > 3 ? '; …' : ''}`;
}

/**
 * Works out which notes the changes would touch and opens the preview. Nothing is written until the user
 * confirms there. `onApplied` runs after the notes have been written.
 */
export async function previewActions(app: App, plugin: Tagafinity, actions: TagAction[], onApplied: () => void): Promise<void> {
	if (actions.length === 0) return;
	try {
		const gateway = plugin.gateway;
		const stats = collectTagStats(plugin.index, { centroids: false });
		const mapper = composeMappers(...actions.map((action) => action.mapper));

		// The index says which notes carry the changed tags; Obsidian's live tag data covers edits made since.
		const paths = new Set(affectedNotes(stats, mapper));
		for (const stat of stats) {
			if (mapper(stat.tag) === stat.tag) continue;
			for (const path of await gateway.notesWithTag(stat.tag)) paths.add(path);
		}

		const plan = await planTagChange(describeActions(actions), [...paths], gateway, mapper);
		if (plan.files.length === 0) {
			new Notice('No notes would change. The index may be out of date, so update it and try again.');
			return;
		}
		new PreviewModal(app, plugin, plan, onApplied).open();
	} catch (error) {
		new Notice(`Tagafinity: ${error instanceof Error ? error.message : String(error)}`, 10000);
	}
}
