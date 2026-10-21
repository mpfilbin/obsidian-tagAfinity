import { App, Modal, Notice, Setting } from 'obsidian';
import type { ChangePlan } from '../cleanup/plan';
import { diffLines } from '../diff';
import { embeddingText } from '../index/sync';
import { describeIndexStatus, pendingChanges } from '../index/status';
import { log } from '../log';
import type Tagafinity from '../main';
import { suggestTags } from '../suggest/engine';
import { extractTags } from '../tags/parse';
import { addTags } from '../tags/transform';
import type { TagSuggestion } from '../types';

export class SuggestTagsModal extends Modal {
	private readonly selected = new Set<string>();
	private content = '';
	private currentTags: string[] = [];

	constructor(
		app: App,
		private readonly plugin: Tagafinity,
		private readonly path: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass('tagafinity-suggest');
		this.contentEl.createEl('h2', { text: 'Suggested tags' });
		void this.run();
	}

	private async run(): Promise<void> {
		const status = this.contentEl.createEl('p', { text: 'Analyzing note…' });
		try {
			if (!this.plugin.hasIndex()) {
				status.setText('The tag index has not been built yet. Building it reads and embeds every note, which can take a few minutes.');
				new Setting(this.contentEl).addButton((button) =>
					button
						.setButtonText('Build index now')
						.setCta()
						.onClick(() => {
							this.contentEl.empty();
							this.contentEl.createEl('h2', { text: 'Suggested tags' });
							void this.plugin.updateIndex().then(() => this.run());
						}),
				);
				return;
			}
			this.renderStaleness();
			this.content = await log.time('suggest', `reading ${this.path}`, () => this.plugin.gateway.readNote(this.path));
			this.currentTags = extractTags(this.content).all;
			const [queryVector] = await log.time('suggest', 'embedding the note', () =>
				this.plugin.embeddingProvider.embed([embeddingText(this.path, this.content)]),
			);
			const s = this.plugin.settings;
			const suggestions = await log.time('suggest', 'ranking tags', async () => suggestTags({
				queryPath: this.path,
				queryVector: queryVector ?? [],
				queryContent: this.content,
				currentTags: this.currentTags,
				index: this.plugin.index,
				options: {
					neighbors: s.neighbors,
					minSimilarity: s.minSimilarity,
					minScore: s.minScore,
					maxSuggestions: s.maxSuggestions,
					maxNew: s.allowNewTags ? s.maxNewTags : 0,
				},
			}));
			log.info('suggest', `${suggestions.length} suggestions`, { tags: suggestions.map((x) => x.tag) });
			status.remove();
			this.render(suggestions);
		} catch (error) {
			status.setText(error instanceof Error ? error.message : String(error));
		}
	}

	/** A non-blocking hint when the vault has changed since the index was built; suggestions still use what exists. */
	private renderStaleness(): void {
		const status = this.plugin.indexStatus();
		if (pendingChanges(status) === 0) return;
		new Setting(this.contentEl)
			.setDesc(describeIndexStatus(status, Date.now()))
			.addButton((button) =>
				button.setButtonText('Update index').onClick(() => {
					this.contentEl.empty();
					this.contentEl.createEl('h2', { text: 'Suggested tags' });
					void this.plugin.updateIndex().then(() => this.run());
				}),
			);
	}

	private render(suggestions: TagSuggestion[]): void {
		const { contentEl } = this;
		if (suggestions.length === 0) {
			contentEl.createEl('p', { text: 'No confident suggestions for this note.' });
			return;
		}
		if (this.currentTags.length > 0) {
			contentEl.createEl('p', { cls: 'setting-item-description', text: `Current tags: ${this.currentTags.map((t) => '#' + t).join(' ')}` });
		}

		for (const suggestion of suggestions) {
			if (!suggestion.isNew && suggestion.score >= 0.5) this.selected.add(suggestion.tag);
			new Setting(contentEl)
				.setName(`#${suggestion.tag}${suggestion.isNew ? ' (new)' : ''}`)
				.setDesc(this.describe(suggestion))
				.addToggle((toggle) =>
					toggle.setValue(this.selected.has(suggestion.tag)).onChange((on) => {
						if (on) this.selected.add(suggestion.tag);
						else this.selected.delete(suggestion.tag);
					}),
				);
		}

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText('Add selected tags')
				.setCta()
				.onClick(() => void this.apply(button.buttonEl)),
		);
	}

	private describe(suggestion: TagSuggestion): string {
		const pct = `${Math.round(suggestion.score * 100)}%`;
		if (suggestion.evidence.length > 0) {
			const notes = suggestion.evidence.map((e) => e.path.replace(/^.*\//, '').replace(/\.md$/i, ''));
			return `${pct} · used on similar notes: ${notes.join(', ')}`;
		}
		return `${pct} · from keyword “${suggestion.terms?.[0] ?? suggestion.tag}”`;
	}

	private async apply(button: HTMLButtonElement): Promise<void> {
		const tags = [...this.selected];
		if (tags.length === 0) {
			new Notice('No tags selected.');
			return;
		}
		button.disabled = true;
		const after = addTags(this.content, tags, this.currentTags);
		const plan: ChangePlan = {
			description: `Add ${tags.map((t) => '#' + t).join(' ')}`,
			files: [{ path: this.path, before: this.content, after, changes: diffLines(this.content, after) }],
		};
		const result = await this.plugin.applyChange(plan);
		this.close();
		new Notice(
			result.applied.length === 1
				? `Added ${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}.`
				: `Could not update the note: ${result.failed[0]?.reason ?? 'unknown error'}`,
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
