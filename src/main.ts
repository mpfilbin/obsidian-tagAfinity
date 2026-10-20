import { FileSystemAdapter, Notice, Plugin, normalizePath } from 'obsidian';
import { CliVaultGateway, type VaultGateway } from './cli/gateway';
import { DEFAULT_BINARY, ExecFileRunner } from './cli/runner';
import { parseExcludePatterns } from './index/exclude';
import { applyPlan, restoreOriginals, type ApplyResult, type ChangePlan } from './cleanup/plan';
import { TransformersEmbeddingProvider } from './embeddings/transformers';
import type { EmbeddingProvider } from './embeddings/provider';
import { emptyIndex, loadIndex, saveIndex, type IndexData, type IndexStorage } from './index/store';
import { refreshIndexEntry, syncIndex } from './index/sync';
import { DEFAULT_SETTINGS, TagafinitySettingTab, type TagafinitySettings } from './settings';
import { SuggestTagsModal } from './ui/suggest-modal';
import { CleanupModal } from './ui/cleanup-modal';

export default class Tagafinity extends Plugin {
	settings: TagafinitySettings = { ...DEFAULT_SETTINGS };
	index: IndexData = emptyIndex(DEFAULT_SETTINGS.embeddingModel);
	private embedder: EmbeddingProvider | null = null;
	private syncing: Promise<void> | null = null;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'suggest-tags',
			name: 'Suggest tags for current note',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) new SuggestTagsModal(this.app, this, file.path).open();
				return true;
			},
		});

		this.addCommand({
			id: 'review-tag-cleanup',
			name: 'Review tag cleanup',
			callback: () => {
				void this.ensureIndex().then((ok) => {
					if (ok) new CleanupModal(this.app, this).open();
				});
			},
		});

		this.addCommand({
			id: 'update-index',
			name: 'Update tag index',
			callback: () => void this.updateIndex(),
		});

		this.addCommand({
			id: 'test-cli-connection',
			name: 'Test CLI connection',
			callback: () => void this.testCli(),
		});

		this.addCommand({
			id: 'undo-last-tag-change',
			name: 'Undo last tag change',
			callback: () => void this.undoLastChange(),
		});

		this.addSettingTab(new TagafinitySettingTab(this.app, this));

		if (this.settings.syncOnStartup) {
			this.app.workspace.onLayoutReady(() => void this.updateIndex(true));
		}
	}

	onunload() {
		this.embedder?.dispose?.();
		this.embedder = null;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.index = await loadIndex(this.indexStorage(), this.settings.embeddingModel);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.embedder && this.embedder.id !== this.settings.embeddingModel) {
			this.embedder.dispose?.();
			this.embedder = null;
		}
	}

	private get cliGateway(): CliVaultGateway {
		const adapter = this.app.vault.adapter;
		const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : undefined;
		const runner = new ExecFileRunner(
			this.settings.cliPath || DEFAULT_BINARY,
			60_000,
			process.platform,
			process.env.HOME ?? '',
			process.env.LOCALAPPDATA ?? '',
			vaultPath,
		);
		// Target this vault explicitly rather than relying on whichever vault the CLI considers active.
		return new CliVaultGateway(runner, { vaultName: this.settings.vaultName || this.app.vault.getName() });
	}

	get gateway(): VaultGateway {
		return this.cliGateway;
	}

	/** Walks through every kind of CLI call the plugin makes, reporting the first one that fails. */
	async testCli(): Promise<void> {
		const gateway = this.cliGateway;
		let step = 'version';
		try {
			const version = await gateway.version();
			step = 'listing notes';
			const notes = await gateway.listNotes();
			step = 'reading a note';
			if (notes[0]) await gateway.readNote(notes[0]);
			new Notice(`Obsidian CLI works (Obsidian ${version}, ${notes.length} notes found).`);
		} catch (error) {
			new Notice(`Tagafinity: CLI test failed while ${step}. ${error instanceof Error ? error.message : String(error)}`, 20000);
		}
	}

	get embeddingProvider(): EmbeddingProvider {
		this.embedder ??= new TransformersEmbeddingProvider(this.settings.embeddingModel);
		return this.embedder;
	}

	private pluginFile(name: string): string {
		return normalizePath(`${this.manifest.dir ?? ''}/${name}`);
	}

	private fileStorage(name: string): IndexStorage {
		const adapter = this.app.vault.adapter;
		const path = this.pluginFile(name);
		return {
			read: async () => ((await adapter.exists(path)) ? adapter.read(path) : null),
			write: (data) => adapter.write(path, data),
		};
	}

	private indexStorage(): IndexStorage {
		return this.fileStorage('index.json');
	}

	/** Builds or refreshes the index. Concurrent calls share one run. */
	updateIndex(quiet = false): Promise<void> {
		this.syncing ??= (async () => {
			console.debug(`[tagafinity] index update started (${quiet ? 'background' : 'requested'})`);
			const notice = quiet ? null : new Notice('Updating tag index…', 0);
			try {
				const { index, stats } = await syncIndex({
					gateway: this.gateway,
					embedder: this.embeddingProvider,
					index: this.index,
					exclude: parseExcludePatterns(this.settings.excludePatterns),
					concurrency: this.settings.cliConcurrency,
					onCheckpoint: (partial) => saveIndex(this.indexStorage(), partial),
					onProgress: (done, total, phase) =>
						notice?.setMessage(`Tagafinity: ${phase === 'reading' ? 'reading' : 'embedding'} notes ${done}/${total}`),
				});
				this.index = index;
				await saveIndex(this.indexStorage(), index);
				console.debug(`[tagafinity] index update finished: ${stats.added} added, ${stats.updated} changed, ${stats.removed} removed, ${stats.unchanged} unchanged`);
				notice?.hide();
				if (!quiet) {
					new Notice(`Index updated: ${stats.added} added, ${stats.updated} changed, ${stats.removed} removed.`);
				}
			} catch (error) {
				notice?.hide();
				new Notice(`Tagafinity: ${error instanceof Error ? error.message : String(error)}`, 10000);
			} finally {
				this.syncing = null;
			}
		})();
		return this.syncing;
	}

	/** Makes sure there is an index to work with, building one on first use. */
	async ensureIndex(): Promise<boolean> {
		if (Object.keys(this.index.notes).length === 0) {
			if (this.syncing) new Notice('Waiting for the index update that is already running…');
			await this.updateIndex();
		}
		return Object.keys(this.index.notes).length > 0;
	}

	/** Applies a previewed plan through the CLI, records undo data and keeps the index current. */
	async applyChange(plan: ChangePlan, onProgress?: (done: number, total: number) => void): Promise<ApplyResult> {
		const result = await applyPlan(plan, this.gateway, onProgress);
		if (result.applied.length > 0) {
			await this.fileStorage('last-change.json').write(JSON.stringify(result.originals));
			for (const file of plan.files) {
				if (result.applied.includes(file.path)) refreshIndexEntry(this.index, file.path, file.after);
			}
			await saveIndex(this.indexStorage(), this.index);
		}
		return result;
	}

	async undoLastChange(): Promise<void> {
		const raw = await this.fileStorage('last-change.json').read();
		if (!raw) {
			new Notice('Nothing to undo.');
			return;
		}
		try {
			const originals = JSON.parse(raw) as Record<string, string>;
			if (Object.keys(originals).length === 0) {
				new Notice('Nothing to undo.');
				return;
			}
			const restored = await restoreOriginals(originals, this.gateway);
			await this.fileStorage('last-change.json').write('{}');
			new Notice(`Restored ${restored} notes. Run “Update tag index” to refresh suggestions.`);
		} catch (error) {
			new Notice(`Tagafinity: ${error instanceof Error ? error.message : String(error)}`, 10000);
		}
	}
}
