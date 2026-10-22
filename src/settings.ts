import { App, PluginSettingTab, Setting, type ButtonComponent } from 'obsidian';
import { describeProgress, progressFraction, type IndexProgress } from './index/progress';
import type Tagafinity from './main';
import { DEFAULT_MODEL } from './embeddings/transformers';
import { SUGGESTION_OVERVIEW, SUGGESTION_SETTING_HELP, formatDefault, type SuggestionSettingKey } from './settings-help';

export interface TagafinitySettings {
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
	/** Run embedding inference in a background worker so Obsidian stays responsive. */
	useEmbeddingWorker: boolean;
	debugLogging: boolean;
}

export const DEFAULT_SETTINGS: TagafinitySettings = {
	embeddingModel: DEFAULT_MODEL,
	neighbors: 10,
	minSimilarity: 0.35,
	minScore: 0.25,
	maxSuggestions: 8,
	allowNewTags: true,
	maxNewTags: 2,
	syncOnStartup: false,
	excludePatterns: '*.excalidraw.md',
	useEmbeddingWorker: true,
	debugLogging: false,
};

export class TagafinitySettingTab extends PluginSettingTab {
	private unsubscribe: (() => void) | null = null;

	constructor(
		app: App,
		private readonly plugin: Tagafinity,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Suggestions').setHeading();

		const overview = containerEl.createDiv({ cls: 'tagafinity-settings-overview setting-item-description' });
		overview.createEl('p', { text: 'How suggestions are made, and where each setting below comes in:' });
		const steps = overview.createEl('ol');
		for (const step of SUGGESTION_OVERVIEW) steps.createEl('li', { text: step });

		this.slider('Similar notes to consider', 'neighbors', 3, 30, 1);
		this.slider('Minimum note similarity', 'minSimilarity', 0.1, 0.8, 0.05);
		this.slider('Minimum tag score', 'minScore', 0.05, 0.9, 0.05);
		this.slider('Maximum suggestions', 'maxSuggestions', 3, 20, 1);

		new Setting(containerEl)
			.setName('Suggest new tags')
			.setDesc('When fewer than three existing tags qualify, also propose new tags built from the note’s most distinctive keywords. A keyword that matches a tag you already use is suggested as that existing tag instead. Turn off to only ever suggest tags that exist in your vault.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.allowNewTags).onChange(async (value) => {
					this.plugin.settings.allowNewTags = value;
					await this.plugin.saveSettings();
				}),
			);

		this.slider('Maximum new tags', 'maxNewTags', 1, 5, 1);

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
			.setName('Compute embeddings in the background')
			.setDesc('Runs the model in a web worker so Obsidian stays responsive. Turn off only if indexing fails with the worker enabled.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.useEmbeddingWorker).onChange(async (value) => {
					this.plugin.settings.useEmbeddingWorker = value;
					await this.plugin.saveSettings();
				}),
			);

		this.displayIndexControls();

		new Setting(containerEl)
			.setName('Update index on startup')
			.setDesc('Off by default: update the index yourself with the command or the button above. When on, only notes changed since the last update are read.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => {
					this.plugin.settings.syncOnStartup = value;
					await this.plugin.saveSettings();
				}),
			);

		this.displayDebugging();
	}

	/** Index status, with live progress while an update runs and buttons that are disabled meanwhile. */
	private displayIndexControls(): void {
		const { containerEl } = this;
		const status = new Setting(containerEl).setName('Index status');
		const rebuild = new Setting(containerEl)
			.setName('Rebuild index from scratch')
			.setDesc('Reads and embeds every note again. Only needed if suggestions look wrong after a large change.');

		let updateButton: ButtonComponent | undefined;
		let rebuildButton: ButtonComponent | undefined;

		const render = (progress: IndexProgress | null, summary?: string): void => {
			status.descEl.empty();
			if (progress) {
				status.descEl.createDiv({ text: describeProgress(progress) });
				const bar = status.descEl.createEl('progress', { cls: 'tagafinity-progress' });
				bar.max = 1;
				const fraction = progressFraction(progress);
				if (fraction !== undefined) bar.value = fraction; // no value attribute means indeterminate
			} else {
				status.descEl.createDiv({ text: [summary, this.plugin.describeIndex()].filter(Boolean).join(' ') });
			}
			updateButton?.setDisabled(progress !== null);
			rebuildButton?.setDisabled(progress !== null);
		};

		const run = (full: boolean): void => {
			// Quiet: progress and the result are shown right here instead of in notices.
			void this.plugin.updateIndex({ quiet: true, full }).then((result) => render(this.plugin.indexProgress, result.summary));
		};

		status.addButton((button) => {
			updateButton = button;
			button.setButtonText('Update now').onClick(() => run(false));
		});
		status.addExtraButton((button) =>
			button
				.setIcon('refresh-cw')
				.setTooltip('Refresh status')
				.onClick(() => render(this.plugin.indexProgress)),
		);
		rebuild.addButton((button) => {
			rebuildButton = button;
			button.setButtonText('Rebuild').onClick(() => run(true));
		});

		render(this.plugin.indexProgress);
		this.unsubscribe?.();
		this.unsubscribe = this.plugin.onIndexProgress((progress) => render(progress));
	}

	hide(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private displayDebugging(): void {
		const { containerEl } = this;
		new Setting(containerEl).setName('Troubleshooting').setHeading();

		new Setting(containerEl)
			.setName('Debug logging')
			.setDesc('Logs what the plugin is doing, with timings, to the developer console (Ctrl+Shift+I). Also reports when the plugin blocks the main thread.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.debugLogging).onChange(async (value) => {
					this.plugin.settings.debugLogging = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Copy debug log')
			.setDesc('Copies the most recent log lines to the clipboard so they can be shared.')
			.addButton((button) => button.setButtonText('Copy').onClick(() => void this.plugin.copyDebugLog()));
	}

	private slider(name: string, key: SuggestionSettingKey, min: number, max: number, step: number): void {
		const help = SUGGESTION_SETTING_HELP[key];
		const setting = new Setting(this.containerEl)
			.setName(name)
			.setDesc(help.what)
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
		const effects = setting.descEl.createDiv({ cls: 'tagafinity-setting-effects' });
		effects.createDiv({ text: `Lower: ${help.lower}` });
		effects.createDiv({ text: `Higher: ${help.higher}` });
		effects.createDiv({ cls: 'tagafinity-setting-default', text: formatDefault(key, DEFAULT_SETTINGS) });
	}
}
