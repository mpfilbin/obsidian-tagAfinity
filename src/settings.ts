import { App, PluginSettingTab, Setting, type ButtonComponent } from 'obsidian';
import { describeProgress, progressFraction, type IndexProgress } from './index/progress';
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
	/** How many CLI processes run at once while indexing. */
	cliConcurrency: number;
	/** Run embedding inference in a background worker so Obsidian stays responsive. */
	useEmbeddingWorker: boolean;
	/** Send note content through the CLI when writing (short notes only). Off: Obsidian's own file API is used. */
	writeThroughCli: boolean;
	debugLogging: boolean;
}

export const DEFAULT_SETTINGS: TagafinitySettings = {
	/** Empty means detect the CLI automatically. */
	cliPath: '',
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
	cliConcurrency: 1,
	useEmbeddingWorker: true,
	writeThroughCli: false,
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

		new Setting(containerEl).setName('Obsidian CLI').setHeading();

		new Setting(containerEl)
			.setName('CLI executable')
			.setDesc('Optional. Leave empty to detect the CLI automatically (it ships beside Obsidian). Set a full path only if detection fails.')
			.addText((text) =>
				text
					.setPlaceholder('Detected automatically')
					.setValue(this.plugin.settings.cliPath)
					.onChange(async (value) => {
						this.plugin.settings.cliPath = value.trim();
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

		this.slider('Parallel CLI calls', 'Notes read at once while indexing. Raise it for speed if indexing runs without errors.', 'cliConcurrency', 1, 6, 1);

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

		new Setting(containerEl)
			.setName('Write notes through the CLI')
			.setDesc(
				'Off by default. Reading and listing always use the CLI. Writing a note through it sends the whole note as a command and can crash Obsidian on long notes, so notes are written through Obsidian directly. When on, only short notes use the CLI.',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.writeThroughCli).onChange(async (value) => {
					this.plugin.settings.writeThroughCli = value;
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

	private slider(
		name: string,
		desc: string,
		key: 'neighbors' | 'minSimilarity' | 'minScore' | 'maxSuggestions' | 'maxNewTags' | 'cliConcurrency',
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