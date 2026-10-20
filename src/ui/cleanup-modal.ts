import { App, Modal, Notice, Setting } from 'obsidian';
import { planTagChange } from '../cleanup/plan';
import type Tagafinity from '../main';
import { renameMapper, removeMapper, type TagMapper } from '../tags/transform';
import { log } from '../log';
import { buildTaxonomyAsync, notesForTag, type TagNode, type Taxonomy } from '../taxonomy/build';
import { yieldEvery } from '../yield';
import { PreviewModal } from './preview-modal';

type Tab = 'merge' | 'nest' | 'prune' | 'tree';

const TABS: { id: Tab; label: string }[] = [
	{ id: 'merge', label: 'Merge' },
	{ id: 'nest', label: 'Nest' },
	{ id: 'prune', label: 'Prune' },
	{ id: 'tree', label: 'Tree' },
];

export class CleanupModal extends Modal {
	private taxonomy: Taxonomy | null = null;
	private tab: Tab = 'merge';
	private body: HTMLElement | null = null;

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
		void this.loadTaxonomy().then((taxonomy) => {
			this.taxonomy = taxonomy;
			summary.setText(
				`${taxonomy.stats.length} tags across ${Object.keys(this.plugin.index.notes).length} notes. ${this.plugin.describeIndex()} Changes are always previewed before they are written.`,
			);
			this.renderTab();
		});
	}

	private renderTab(): void {
		const body = this.body;
		if (!body || !this.taxonomy) return;
		body.empty();
		switch (this.tab) {
			case 'merge':
				return this.renderMerge(body);
			case 'nest':
				return this.renderNest(body);
			case 'prune':
				return this.renderPrune(body);
			case 'tree':
				return this.renderTree(body);
		}
	}

	private renderMerge(body: HTMLElement): void {
		if (this.taxonomy!.mergeCandidates.length === 0) {
			body.createEl('p', { text: 'No duplicate or overlapping tags found.' });
			return;
		}
		for (const candidate of this.taxonomy!.mergeCandidates.slice(0, 50)) {
			new Setting(body)
				.setName(`#${candidate.from} → #${candidate.into}`)
				.setDesc(candidate.reasons.join('; '))
				.addButton((b) => b.setButtonText('Preview').onClick(() => void this.preview(`Merge #${candidate.from} into #${candidate.into}`, candidate.from, renameMapper(candidate.from, candidate.into))))
				.addExtraButton((b) =>
					b.setIcon('arrow-left-right').setTooltip('Swap direction').onClick(() => void this.preview(`Merge #${candidate.into} into #${candidate.from}`, candidate.into, renameMapper(candidate.into, candidate.from))),
				);
		}
	}

	private renderNest(body: HTMLElement): void {
		if (this.taxonomy!.parentCandidates.length === 0) {
			body.createEl('p', { text: 'No nesting opportunities found.' });
			return;
		}
		for (const candidate of this.taxonomy!.parentCandidates.slice(0, 50)) {
			new Setting(body)
				.setName(`#${candidate.tag} → #${candidate.proposed}`)
				.setDesc(`${Math.round(candidate.containment * 100)}% of notes tagged #${candidate.tag} are also tagged #${candidate.parent}`)
				.addButton((b) => b.setButtonText('Preview').onClick(() => void this.preview(`Nest #${candidate.tag} under #${candidate.parent}`, candidate.tag, renameMapper(candidate.tag, candidate.proposed))));
		}
	}

	private renderPrune(body: HTMLElement): void {
		if (this.taxonomy!.pruneCandidates.length === 0) {
			body.createEl('p', { text: 'No rarely used tags found.' });
			return;
		}
		for (const candidate of this.taxonomy!.pruneCandidates.slice(0, 100)) {
			new Setting(body)
				.setName(`#${candidate.tag}`)
				.setDesc(`Used in ${candidate.notes.map((p) => p.replace(/\.md$/i, '')).join(', ')}`)
				.addButton((b) => b.setButtonText('Preview removal').onClick(() => void this.preview(`Remove #${candidate.tag}`, candidate.tag, removeMapper(candidate.tag))));
		}
	}

	private renderTree(body: HTMLElement): void {
		const render = (nodes: TagNode[], parent: HTMLElement): void => {
			const list = parent.createEl('ul', { cls: 'tagafinity-tree' });
			for (const node of nodes) {
				const item = list.createEl('li');
				item.createSpan({ text: `#${node.name}` });
				item.createSpan({ cls: 'tagafinity-tree-count', text: ` ${node.totalCount}` });
				if (node.children.length > 0) render(node.children, item);
			}
		};
		render(this.taxonomy!.tree, body);
	}

	private async preview(description: string, tag: string, mapper: TagMapper): Promise<void> {
		try {
			const gateway = this.plugin.gateway;
			// Union of the (possibly stale) index and what Obsidian reports now, so edits since the last update are not missed.
			const live = await gateway.notesWithTag(tag).catch(() => [] as string[]);
			const paths = [...new Set([...notesForTag(this.taxonomy!.stats, tag), ...live])];
			const plan = await planTagChange(description, paths, gateway, mapper);
			if (plan.files.length === 0) {
				new Notice('No notes would change. The index may be out of date, so update it and try again.');
				return;
			}
			new PreviewModal(this.app, this.plugin, plan, () => {
				void this.loadTaxonomy().then((taxonomy) => {
					this.taxonomy = taxonomy;
					this.renderTab();
				});
			}).open();
		} catch (error) {
			new Notice(`Tagafinity: ${error instanceof Error ? error.message : String(error)}`, 10000);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
