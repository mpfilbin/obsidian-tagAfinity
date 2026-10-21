import { App, Modal, Setting } from 'obsidian';
import type { TagAction } from '../cleanup/tag-actions';
import { log } from '../log';
import type Tagafinity from '../main';
import { removeMapper, renameMapper } from '../tags/transform';
import { buildTaxonomyAsync, type Taxonomy } from '../taxonomy/build';
import { yieldEvery } from '../yield';
import { previewActions } from './preview-actions';

type Tab = 'merge' | 'nest' | 'prune';

const TABS: { id: Tab; label: string }[] = [
	{ id: 'merge', label: 'Merge' },
	{ id: 'nest', label: 'Nest' },
	{ id: 'prune', label: 'Prune' },
];

interface ActionRow {
	action: TagAction;
	title: string;
	detail: string;
	previewLabel: string;
	/** The same merge in the opposite direction. */
	swapped?: TagAction;
}

export class CleanupModal extends Modal {
	private taxonomy: Taxonomy | null = null;
	private tab: Tab = 'merge';
	private body: HTMLElement | null = null;
	private footer: HTMLElement | null = null;
	/** Chosen changes by key; kept while switching tabs. */
	private readonly selected = new Map<string, TagAction>();

	constructor(
		app: App,
		private readonly plugin: Tagafinity,
	) {
		super(app);
	}

	/** Builds the taxonomy in slices so Obsidian stays responsive while the tag graph is analysed. */
	private async loadTaxonomy(): Promise<Taxonomy> {
		return log.time('cleanup', 'analysing tags', () => buildTaxonomyAsync(this.plugin.index, yieldEvery(5)), {
			notes: Object.keys(this.plugin.index.notes).length,
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('tagafinity-cleanup');
		contentEl.createEl('h2', { text: 'Tag cleanup' });
		const summary = contentEl.createEl('p', { cls: 'setting-item-description', text: 'Analysing tags…' });

		const nav = contentEl.createDiv({ cls: 'tagafinity-tabs' });
		const openTree = nav.createEl('button', { text: 'Open tag tree', cls: 'tagafinity-open-tree' });
		openTree.addEventListener('click', () => {
			void this.plugin.openTagTree();
			this.close();
		});
		for (const tab of TABS) {
			const button = nav.createEl('button', { text: tab.label, cls: tab.id === this.tab ? 'mod-cta' : '' });
			button.addEventListener('click', () => {
				this.tab = tab.id;
				nav.querySelectorAll('button').forEach((b) => b.removeClass('mod-cta'));
				button.addClass('mod-cta');
				this.renderTab();
			});
		}
		this.body = contentEl.createDiv({ cls: 'tagafinity-tab-body' });
		this.footer = contentEl.createDiv({ cls: 'tagafinity-selection-bar' });
		void this.loadTaxonomy().then((taxonomy) => {
			this.taxonomy = taxonomy;
			summary.setText(
				`${taxonomy.stats.length} tags across ${Object.keys(this.plugin.index.notes).length} notes. ${this.plugin.describeIndex()} Tick the changes you want, then preview them together; nothing is written until you confirm.`,
			);
			this.renderTab();
		});
	}

	private rowsFor(taxonomy: Taxonomy, tab: Tab): ActionRow[] {
		switch (tab) {
			case 'merge':
				return taxonomy.mergeCandidates.slice(0, 50).map((c) => ({
					action: { key: `merge:${c.from}>${c.into}`, description: `Merge #${c.from} into #${c.into}`, source: c.from, target: c.into, mapper: renameMapper(c.from, c.into) },
					title: `#${c.from} → #${c.into}`,
					detail: c.reasons.join('; '),
					previewLabel: 'Preview',
					swapped: { key: `merge:${c.into}>${c.from}`, description: `Merge #${c.into} into #${c.from}`, source: c.into, target: c.from, mapper: renameMapper(c.into, c.from) },
				}));
			case 'nest':
				return taxonomy.parentCandidates.slice(0, 50).map((c) => ({
					action: { key: `nest:${c.tag}`, description: `Nest #${c.tag} under #${c.parent}`, source: c.tag, target: c.proposed, mapper: renameMapper(c.tag, c.proposed) },
					title: `#${c.tag} → #${c.proposed}`,
					detail: `${Math.round(c.containment * 100)}% of notes tagged #${c.tag} are also tagged #${c.parent}`,
					previewLabel: 'Preview',
				}));
			case 'prune':
				return taxonomy.pruneCandidates.slice(0, 100).map((c) => ({
					action: { key: `prune:${c.tag}`, description: `Remove #${c.tag}`, source: c.tag, mapper: removeMapper(c.tag) },
					title: `#${c.tag}`,
					detail: `Used in ${c.notes.map((p) => p.replace(/\.md$/i, '')).join(', ')}`,
					previewLabel: 'Preview removal',
				}));
		}
	}

	private renderTab(): void {
		const body = this.body;
		if (!body || !this.taxonomy) return;
		body.empty();
		this.renderRows(body, this.rowsFor(this.taxonomy, this.tab));
		this.renderFooter();
	}

	private renderRows(body: HTMLElement, rows: ActionRow[]): void {
		if (rows.length === 0) {
			body.createEl('p', { text: 'Nothing to suggest here.' });
			return;
		}
		for (const row of rows) {
			const setting = new Setting(body).setName(row.title).setDesc(row.detail);
			setting.addToggle((toggle) =>
				toggle.setValue(this.selected.has(row.action.key)).onChange((on) => {
					if (on) this.selected.set(row.action.key, row.action);
					else this.selected.delete(row.action.key);
					this.renderFooter();
				}),
			);
			setting.addButton((b) => b.setButtonText(row.previewLabel).onClick(() => void this.preview([row.action])));
			const swapped = row.swapped;
			if (swapped) {
				setting.addExtraButton((b) =>
					b.setIcon('arrow-left-right').setTooltip('Preview the opposite direction').onClick(() => void this.preview([swapped])),
				);
			}
		}
	}

	/** Selection controls and the batch preview button; kept below the scrolling list. */
	private renderFooter(): void {
		const footer = this.footer;
		if (!footer) return;
		footer.empty();
		const rows = this.taxonomy ? this.rowsFor(this.taxonomy, this.tab) : [];

		footer.createEl('button', { text: 'Select all on this tab' }).addEventListener('click', () => {
			for (const row of rows) this.selected.set(row.action.key, row.action);
			this.renderTab();
		});
		footer.createEl('button', { text: 'Clear selection' }).addEventListener('click', () => {
			this.selected.clear();
			this.renderTab();
		});
		const count = this.selected.size;
		const preview = footer.createEl('button', {
			text: count === 0 ? 'Preview selected' : `Preview ${count} selected`,
			cls: 'mod-cta',
		});
		preview.disabled = count === 0;
		preview.addEventListener('click', () => void this.preview([...this.selected.values()]));
	}

	/** Previews one or several changes as a single combined change. Nothing is written until confirmed there. */
	private async preview(actions: TagAction[]): Promise<void> {
		await previewActions(this.app, this.plugin, actions, () => {
			this.selected.clear();
			void this.loadTaxonomy().then((fresh) => {
				this.taxonomy = fresh;
				this.renderTab();
			});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
