import { Notice, Plugin, TFile, normalizePath, type WorkspaceLeaf } from 'obsidian';
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
import { describeProgress, type IndexProgress } from './index/progress';
import { computeIndexStatus, describeIndexStatus, pendingChanges, type IndexStatus } from './index/status';
import { refreshIndexEntry, syncIndex, type NoteStat } from './index/sync';
import { DEFAULT_SETTINGS, TagafinitySettingTab, type TagafinitySettings } from './settings';
import { SuggestTagsModal } from './ui/suggest-modal';
import { ObsidianVaultGateway } from './vault/obsidian-gateway';
import type { VaultGateway } from './vault/gateway';
import { CleanupModal } from './ui/cleanup-modal';
import { UNTAGGED_NOTES_VIEW, UntaggedNotesView } from './ui/untagged-notes-view';
import { TAG_TREE_VIEW, TagTreeView } from './ui/tag-tree-view';

/** What an index update did, for callers that want to report it. */
export interface IndexUpdateResult {
	summary: string;
	failed: boolean;
}

export default class Tagafinity extends Plugin {
	settings: TagafinitySettings = { ...DEFAULT_SETTINGS };
	index: IndexData = emptyIndex(DEFAULT_SETTINGS.embeddingModel);
	private embedder: EmbeddingProvider | null = null;
	private embedderUsesWorker = true;
	private stopStallMonitor: (() => void) | null = null;
	private syncing: Promise<IndexUpdateResult> | null = null;
	private progress: IndexProgress | null = null;
	private readonly progressListeners = new Set<(progress: IndexProgress | null) => void>();
	private readonly indexListeners = new Set<() => void>();

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

		this.registerView(TAG_TREE_VIEW, (leaf) => new TagTreeView(leaf, this));
		this.addRibbonIcon('tags', 'Open tag tree', () => void this.openTagTree());
		this.registerView(UNTAGGED_NOTES_VIEW, (leaf) => new UntaggedNotesView(leaf, this));
		this.addCommand({
			id: 'open-tag-tree',
			name: 'Open tag tree',
			callback: () => void this.openTagTree(),
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
			id: 'find-untagged-notes',
			name: 'Find notes without tags',
			callback: () => void this.openUntaggedNotes(),
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

	private vaultGateway: VaultGateway | null = null;

	/** Vault access through Obsidian's own API. */
	get gateway(): VaultGateway {
		this.vaultGateway ??= new ObsidianVaultGateway(this.app);
		return this.vaultGateway;
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

	/** Shows the tag tree in the right sidebar, reusing an open one. */
	async openTagTree(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(TAG_TREE_VIEW)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: TAG_TREE_VIEW, active: true });
		}
		if (leaf) await workspace.revealLeaf(leaf);
	}

	/** Subscribes to changes of the index contents (an update finished or tags were changed). */
	onIndexChanged(listener: () => void): () => void {
		this.indexListeners.add(listener);
		return () => this.indexListeners.delete(listener);
	}

	private notifyIndexChanged(): void {
		for (const listener of this.indexListeners) listener();
	}

	/** The update in progress, or null when none is running. */
	get indexProgress(): IndexProgress | null {
		return this.progress;
	}

	/** Subscribes to progress of index updates (null when one ends). Returns a function that unsubscribes. */
	onIndexProgress(listener: (progress: IndexProgress | null) => void): () => void {
		this.progressListeners.add(listener);
		return () => this.progressListeners.delete(listener);
	}

	private setProgress(progress: IndexProgress | null): void {
		this.progress = progress;
		for (const listener of this.progressListeners) listener(progress);
	}

	/**
	 * Updates the index. Only notes whose modification time or size changed are read and embedded, so an update
	 * with nothing new does nothing. `full` re-reads every note. Concurrent calls share one run. `quiet` suppresses
	 * the progress and completion notices (errors are always shown); progress is available via onIndexProgress.
	 */
	updateIndex(options: { quiet?: boolean; full?: boolean } = {}): Promise<IndexUpdateResult> {
		const { quiet = false, full = false } = options;
		if (!this.syncing && !full && this.hasIndex() && pendingChanges(this.indexStatus()) === 0) {
			log.info('index', 'update skipped: nothing changed');
			const summary = this.describeIndex();
			if (!quiet) new Notice(summary);
			return Promise.resolve({ summary, failed: false });
		}
		this.syncing ??= (async (): Promise<IndexUpdateResult> => {
			const refreshingTags = this.indexStatus().tagRulesOutdated;
			log.info('index', `update started (${quiet ? 'background' : 'requested'}${full ? ', full rebuild' : ''}${refreshingTags ? ', refreshing tags' : ''})`);
			const notice = quiet ? null : new Notice('Updating tag index…', 0);
			this.setProgress({ phase: 'preparing', done: 0, total: 0 });
			try {
				const { index, stats } = await syncIndex({
					gateway: this.gateway,
					embedder: this.embeddingProvider,
					index: this.index,
					stats: this.currentStats(),
					full,
					exclude: parseExcludePatterns(this.settings.excludePatterns),
					onCheckpoint: (partial) => saveIndex(this.indexStorage(), partial),
					onProgress: (done, total, phase) => {
						const progress = { phase, done, total };
						this.setProgress(progress);
						notice?.setMessage(`Tagafinity: ${describeProgress(progress)}`);
					},
				});
				this.index = index;
				await saveIndex(this.indexStorage(), index);
				this.notifyIndexChanged();
				log.info('index', `update finished: ${stats.added} added, ${stats.updated} changed, ${stats.removed} removed, ${stats.unchanged} unchanged`);
				notice?.hide();
				const corrected =
					stats.retagged > 0
						? ` Tags corrected in ${stats.retagged} ${stats.retagged === 1 ? 'note' : 'notes'}; no longer tags: ${stats.droppedTags.slice(0, 5).map((t) => '#' + t).join(' ')}${stats.droppedTags.length > 5 ? ' …' : ''}.`
						: refreshingTags
							? ' No tags needed correcting.'
							: '';
				const summary = `Index updated${refreshingTags ? ' under the new tag detection rules' : ''}: ${stats.added} added, ${stats.updated} changed, ${stats.removed} removed.${corrected}`;
				if (!quiet) new Notice(summary);
				return { summary, failed: false };
			} catch (error) {
				notice?.hide();
				const message = error instanceof Error ? error.message : String(error);
				log.info('index', `update failed: ${message}`);
				new Notice(`Tagafinity: ${message}`, 10000);
				return { summary: `Update failed: ${message}`, failed: true };
			} finally {
				this.syncing = null;
				this.setProgress(null);
			}
		})();
		return this.syncing;
	}

	/** Shows the notes without tags in the right sidebar, reusing an open panel. */
	async openUntaggedNotes(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(UNTAGGED_NOTES_VIEW)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: UNTAGGED_NOTES_VIEW, active: true });
		}
		if (leaf) await workspace.revealLeaf(leaf);
	}

	/** Applies a previewed plan, records undo data and keeps the index current. */
	async applyChange(plan: ChangePlan, onProgress?: (done: number, total: number) => void): Promise<ApplyResult> {
		const undoStore = this.fileStorage('last-change.json');
		// Save every original before the first write: if Obsidian dies mid-way, "Undo last tag change" still works.
		const result = await applyPlan(plan, this.gateway, onProgress, (originals) => undoStore.write(JSON.stringify(originals)));
		if (result.applied.length > 0) {
			await undoStore.write(JSON.stringify(result.originals));
			for (const file of plan.files) {
				if (!result.applied.includes(file.path)) continue;
				const note = this.app.vault.getAbstractFileByPath(file.path);
				refreshIndexEntry(this.index, file.path, file.after, note instanceof TFile ? { mtime: note.stat.mtime, size: note.stat.size } : undefined);
			}
			await saveIndex(this.indexStorage(), this.index);
			this.notifyIndexChanged();
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
