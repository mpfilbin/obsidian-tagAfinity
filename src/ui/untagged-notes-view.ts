import { ExtraButtonComponent, ItemView, type WorkspaceLeaf } from 'obsidian';
import { pendingChanges } from '../index/status';
import type Tagafinity from '../main';
import { describeUntaggedCount, filterNotePaths, findUntaggedNotes } from '../taxonomy/untagged';
import { openNote } from './open-note';

export const UNTAGGED_NOTES_VIEW = 'tagafinity-untagged-notes';

/** Every indexed note that has no tags, in a scrollable list with a filter. Click a note to open it. */
export class UntaggedNotesView extends ItemView {
	private paths: string[] = [];
	private query = '';
	private unsubscribe: (() => void) | null = null;
	private summaryEl!: HTMLElement;
	private listEl!: HTMLElement;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: Tagafinity,
	) {
		super(leaf);
	}

	getViewType(): string {
		return UNTAGGED_NOTES_VIEW;
	}

	getDisplayText(): string {
		return 'Notes without tags';
	}

	getIcon(): string {
		return 'file-question';
	}

	onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('tagafinity-untagged-view');

		const toolbar = root.createDiv({ cls: 'tagafinity-untagged-toolbar' });
		const search = toolbar.createEl('input', { type: 'search', placeholder: 'Filter notes' });
		search.setAttribute('aria-label', 'Filter notes without tags');
		search.addEventListener('input', () => {
			this.query = search.value;
			this.render();
		});
		const buttons = toolbar.createDiv({ cls: 'tagafinity-tree-buttons' });
		new ExtraButtonComponent(buttons)
			.setIcon('refresh-cw')
			.setTooltip('Rebuild from the index')
			.onClick(() => this.refresh());

		this.summaryEl = root.createDiv({ cls: 'tagafinity-untagged-summary setting-item-description' });
		this.listEl = root.createDiv({ cls: 'tagafinity-untagged-list' });

		this.unsubscribe = this.plugin.onIndexChanged(() => this.refresh());
		this.refresh();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		return Promise.resolve();
	}

	/** Re-reads the untagged notes from the plugin's index, keeping the filter. */
	refresh(): void {
		this.paths = this.plugin.hasIndex() ? findUntaggedNotes(this.plugin.index) : [];
		this.render();
	}

	private render(): void {
		this.listEl.empty();
		if (!this.plugin.hasIndex()) {
			this.summaryEl.setText('The tag index has not been built yet. Build it from the plugin settings or the update command first.');
			return;
		}
		const shown = filterNotePaths(this.paths, this.query);
		const behind = pendingChanges(this.plugin.indexStatus()) > 0;
		this.summaryEl.setText(describeUntaggedCount(this.paths.length, shown.length, behind));

		for (const path of shown) {
			const slash = path.lastIndexOf('/');
			const item = this.listEl.createDiv({ cls: 'tagafinity-note', attr: { tabindex: '0', role: 'link' } });
			item.createSpan({ text: path.slice(slash + 1).replace(/\.md$/i, '') });
			if (slash >= 0) item.createSpan({ cls: 'tagafinity-note-folder', text: path.slice(0, slash) });
			item.addEventListener('click', (evt) => openNote(this.app, path, evt));
			item.addEventListener('keydown', (evt) => {
				if (evt.key === 'Enter') openNote(this.app, path, evt);
			});
		}
	}
}
