import { App, PluginSettingTab, Setting } from 'obsidian';
import type Tagafinity from './main';
import { DEFAULT_MODEL } from './embeddings/transformers';

export interface TagafinitySettings {
	cliPath: string;
	vaultName: string;
	embeddingModel: string;
	neighbors: number;
	minSimilarity: number;
	minScore: number;
	maxSuggestions: number;
	allowNewTags: boolean;
	maxNewTags: number;
	syncOnStartup: boolean;
	/** One pattern per line: "*.ext" or a folder path. */
	excludePatterns: string;
}

export const DEFAULT_SETTINGS: TagafinitySettings = {
	cliPath: 'obsidian',
	vaultName: '',
	embeddingModel: DEFAULT_MODEL,
	neighbors: 10,
	minSimilarity: 0.35,
	minScore: 0.25,
	maxSuggestions: 8,
	allowNewTags: true,
	maxNewTags: 2,
	syncOnStartup: false,
	excludePatterns: '*.excalidraw.md',
};

export class TagafinitySettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: Tagafinity,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Obsidian CLI').setHeading();

		new Setting(containerEl)
			.setName('CLI executable')
			.setDesc('Name or full path of the CLI executable. The default finds the CLI automatically; on Windows set the full path to Obsidian.com if it fails.')
			.addText((text) =>
				text.setValue(this.plugin.settings.cliPath).onChange(async (value) => {
					this.plugin.settings.cliPath = value.trim() || DEFAULT_SETTINGS.cliPath;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Vault name')
			.setDesc('Passed to the CLI as the target vault. Leave empty to use the CLI default.')
			.addText((text) =>
				text.setValue(this.plugin.settings.vaultName).onChange(async (value) => {
					this.plugin.settings.vaultName = value.trim();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName('Suggestions').setHeading();

		this.slider('Similar notes to consider', 'How many nearest notes vote on tags.', 'neighbors', 3, 30, 1);
		this.slider('Minimum note similarity', 'Notes less similar than this are ignored.', 'minSimilarity', 0.1, 0.8, 0.05);
		this.slider('Minimum tag score', 'Existing tags scoring below this are hidden.', 'minScore', 0.05, 0.9, 0.05);
		this.slider('Maximum suggestions', 'Upper limit of tags shown.', 'maxSuggestions', 3, 20, 1);

		new Setting(containerEl)
			.setName('Suggest new tags')
			.setDesc('When too few existing tags fit, propose new tags from the note’s keywords.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.allowNewTags).onChange(async (value) => {
					this.plugin.settings.allowNewTags = value;
					await this.plugin.saveSettings();
				}),
			);

		this.slider('Maximum new tags', 'Upper limit of newly proposed tags.', 'maxNewTags', 1, 5, 1);

		new Setting(containerEl).setName('Index').setHeading();

		new Setting(containerEl)
			.setName('Embedding model')
			.setDesc('The model that computes embeddings locally. Changing it rebuilds the index.')
			.addText((text) =>
				text.setValue(this.plugin.settings.embeddingModel).onChange(async (value) => {
					this.plugin.settings.embeddingModel = value.trim() || DEFAULT_MODEL;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Excluded notes')
			.setDesc('Notes to leave out of the index, one per line. Use *.ext to match a file ending, or a folder path.')
			.addTextArea((area) =>
				area.setValue(this.plugin.settings.excludePatterns).onChange(async (value) => {
					this.plugin.settings.excludePatterns = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Update index on startup')
			.setDesc('Re-embed changed notes in the background when Obsidian starts.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => {
					this.plugin.settings.syncOnStartup = value;
					await this.plugin.saveSettings();
				}),
			);
	}

	private slider(
		name: string,
		desc: string,
		key: 'neighbors' | 'minSimilarity' | 'minScore' | 'maxSuggestions' | 'maxNewTags',
		min: number,
		max: number,
		step: number,
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addSlider((slider) =>
				slider
					.setLimits(min, max, step)
					.setValue(this.plugin.settings[key])
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings[key] = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
