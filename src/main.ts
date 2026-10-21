import { FileSystemAdapter, Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { FallbackWriteGateway } from './cli/fallback-gateway';
import { CliVaultGateway, type VaultGateway } from './cli/gateway';
import { ObsidianApiWriter } from './cli/obsidian-writer';
import { DEFAULT_BINARY, ExecFileRunner } from './cli/runner';
import { parseExcludePatterns } from './index/exclude';
import { applyPlan, restoreOriginals, type ApplyResult, type ChangePlan } from './cleanup/plan';
import { FallbackEmbeddingProvider } from './embeddings/fallback';
import { spawnEmbeddingWorker } from './embeddings/spawn-worker';
import { TransformersEmbeddingProvider } from './embeddings/transformers';
import { WorkerEmbeddingProvider } from './embeddings/worker-provider';
import { log } from './log';
import { startStallMonitor } from './stall-monitor';
import type { EmbeddingProvider } from './embeddings/provider';
import { emptyIndex, loadIndex, saveIndex, type IndexData, type IndexStorage } from './index/store';
import { computeIndexStatus, describeIndexStatus, pendingChanges, type IndexStatus } from './index/status';
import { refreshIndexEntry, syncIndex, type NoteStat } from './index/sync';
import { DEFAULT_SETTINGS, TagafinitySettingTab, type TagafinitySettings } from './settings';
import { SuggestTagsModal } from './ui/suggest-modal';
import { CleanupModal } from './ui/cleanup-modal';

export default class Tagafinity extends Plugin {
	settings: TagafinitySettings = { ...DEFAULT_SETTINGS };
	index: IndexData = emptyIndex(DEFAULT_SETTINGS.embeddingModel);
	private embedder: EmbeddingProvider | null = null;
	private embedderUsesWorker = true;
	private stopStallMonitor: (() => void) | null = null;
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
				if (!this.hasIndex()) {
					new Notice('The tag index has not been built yet. Build it from the plugin settings or the update command first.');
					return;
				}
				new CleanupModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: 'update-index',
			name: 'Update tag index',
			callback: () => void this.updateIndex(),
		});

		this.addCommand({
			id: 'rebuild-index',
			name: 'Rebuild tag index from scratch',
			callback: () => void this.updateIndex({ full: true }),
		});

		this.addCommand({
			id: 'show-index-status',
			name: 'Show tag index status',
			callback: () => new Notice(this.describeIndex(), 8000),
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

		this.addCommand({
			id: 'copy-debug-log',
			name: 'Copy debug log',
			callback: () => void this.copyDebugLog(),
		});

		this.addSettingTab(new TagafinitySettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			const status = this.indexStatus();
			log.info('index', describeIndexStatus(status, Date.now()));
			if (this.settings.syncOnStartup && pendingChanges(status) > 0) void this.updateIndex({ quiet: true });
		});
	}

	onunload() {
		this.stopStallMonitor?.();
		this.stopStallMonitor = null;
		this.embedder?.dispose?.();
		this.embedder = null;
	}

	/** Applies the debug setting: turns logging and main-thread stall reporting on or off. */
	private applyDebugSetting(): void {
		log.setEnabled(this.settings.debugLogging);
		this.stopStallMonitor?.();
		this.stopStallMonitor = this.settings.debugLogging ? startStallMonitor(log) : null;
		log.info('plugin', `debug logging enabled (worker embeddings: ${this.settings.useEmbeddingWorker})`);
	}

	async copyDebugLog(): Promise<void> {
		const lines = log.history();
		if (lines.length === 0) {
			new Notice('The debug log is empty. Turn on debug logging in the plugin settings and try again.');
			return;
		}
		await navigator.clipboard.writeText(lines.join('\n'));
		new Notice(`Copied ${lines.length} log lines.`);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.applyDebugSetting();
		this.index = await loadIndex(this.indexStorage(), this.settings.embeddingModel);
		log.info('plugin', `loaded index: ${Object.keys(this.index.notes).length} notes`);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (log.isEnabled() !== this.settings.debugLogging) this.applyDebugSetting();
		if (this.embedder && (this.embedder.id !== this.settings.embeddingModel || this.embedderUsesWorker !== this.settings.useEmbeddingWorker)) {
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
			process.execPath,
		);
		// Target this vault explicitly rather than relying on whichever vault the CLI considers active.
		return new CliVaultGateway(runner, { vaultName: this.settings.vaultName || this.app.vault.getName() });
	}

	/** CLI for everything it can do faithfully; notes it cannot carry (backslashes, very large) are written through the Obsidian API. */
	get gateway(): VaultGateway {
		return new FallbackWriteGateway(this.cliGateway, new ObsidianApiWriter(this.app));
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
		if (!this.embedder) {
			const model = this.settings.embeddingModel;
			const mainThread = () => new TransformersEmbeddingProvider(model);
			this.embedderUsesWorker = this.settings.useEmbeddingWorker;
			this.embedder = this.embedderUsesWorker
				? new FallbackEmbeddingProvider(new WorkerEmbeddingProvider(model, () => spawnEmbeddingWorker(__EMBEDDING_WORKER_SOURCE__)), mainThread)
				: mainThread();
		}
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

	/** Modification time and size of every note, straight from Obsidian: instant, and reads no note content. */
	private currentStats(): Map<string, NoteStat> {
		return new Map(this.app.vault.getMarkdownFiles().map((file) => [file.path, { mtime: file.stat.mtime, size: file.stat.size }]));
	}

	/** How far the index is behind the vault. Cheap enough to call whenever it is needed. */
	indexStatus(): IndexStatus {
		return computeIndexStatus(this.index, this.currentStats(), parseExcludePatterns(this.settings.excludePatterns));
	}

	describeIndex(): string {
		return describeIndexStatus(this.indexStatus(), Date.now());
	}

	hasIndex(): boolean {
		return Object.keys(this.index.notes).length > 0;
	}

	/**
	 * Updates the index. Only notes whose modification time or size changed are read and embedded, so an update
	 * with nothing new does nothing. `full` re-reads every note. Concurrent calls share one run.
	 */
	updateIndex(options: { quiet?: boolean; full?: boolean } = {}): Promise<void> {
		const { quiet = false, full = false } = options;
		if (!this.syncing && !full && this.hasIndex() && pendingChanges(this.indexStatus()) === 0) {
			log.info('index', 'update skipped: nothing changed');
			if (!quiet) new Notice(this.describeIndex());
			return Promise.resolve();
		}
		this.syncing ??= (async () => {
			log.info('index', `update started (${quiet ? 'background' : 'requested'}${full ? ', full rebuild' : ''})`);
			const notice = quiet ? null : new Notice('Updating tag index…', 0);
			try {
				const { index, stats } = await syncIndex({
					gateway: this.gateway,
					embedder: this.embeddingProvider,
					index: this.index,
					stats: this.currentStats(),
					full,
					exclude: parseExcludePatterns(this.settings.excludePatterns),
					concurrency: this.settings.cliConcurrency,
					onCheckpoint: (partial) => saveIndex(this.indexStorage(), partial),
					onProgress: (done, total, phase) =>
						notice?.setMessage(`Tagafinity: ${phase === 'reading' ? 'reading' : 'embedding'} notes ${done}/${total}`),
				});
				this.index = index;
				await saveIndex(this.indexStorage(), index);
				log.info('index', `update finished: ${stats.added} added, ${stats.updated} changed, ${stats.removed} removed, ${stats.unchanged} unchanged`);
				notice?.hide();
				if (!quiet) {
					new Notice(`Index updated: ${stats.added} added, ${stats.updated} changed, ${stats.removed} removed.`);
				}
			} catch (error) {
				notice?.hide();
				log.info('index', `update failed: ${error instanceof Error ? error.message : String(error)}`);
				new Notice(`Tagafinity: ${error instanceof Error ? error.message : String(error)}`, 10000);
			} finally {
				this.syncing = null;
			}
		})();
		return this.syncing;
	}

	/** Applies a previewed plan through the CLI, records undo data and keeps the index current. */
	async applyChange(plan: ChangePlan, onProgress?: (done: number, total: number) => void): Promise<ApplyResult> {
		const result = await applyPlan(plan, this.gateway, onProgress);
		if (result.applied.length > 0) {
			await this.fileStorage('last-change.json').write(JSON.stringify(result.originals));
			for (const file of plan.files) {
				if (!result.applied.includes(file.path)) continue;
				const note = this.app.vault.getAbstractFileByPath(file.path);
				refreshIndexEntry(this.index, file.path, file.after, note instanceof TFile ? { mtime: note.stat.mtime, size: note.stat.size } : undefined);
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
