import { ExtraButtonComponent, ItemView, Keymap, Menu, Notice, TFile, setIcon, type WorkspaceLeaf } from 'obsidian';
import { resolveDrop } from '../cleanup/drop';
import {
	isSameOrDescendant,
	mergeAction,
	moveAction,
	removeAction,
	renameAction,
	type ActionResult,
	type TagAction,
} from '../cleanup/tag-actions';
import type Tagafinity from '../main';
import { buildTree, collectTagStats, type TagNode } from '../taxonomy/build';
import { allTagPaths, defaultExpanded, filterTree, sortTree, type TreeSort } from '../taxonomy/tree-view';
import { previewActions } from './preview-actions';
import { PromptModal } from './prompt-modal';
import { TagPickerModal } from './tag-picker-modal';

export const TAG_TREE_VIEW = 'tagafinity-tag-tree';

/** How many notes the notes pane lists before summarizing the rest. */
const NOTE_LIST_LIMIT = 200;

/** The vault's tags as a collapsible hierarchy, with a filter, sorting and a list of the notes under each tag. */
export class TagTreeView extends ItemView {
	private tree: TagNode[] = [];
	private noteCount = 0;
	private tagCount = 0;
	private query = '';
	private sort: TreeSort = 'count';
	private expanded = new Set<string>();
	/** Nodes the user closed while a filter was forcing them open. */
	private filterClosed = new Set<string>();
	private selected: string | null = null;
	private expandedInitialized = false;
	private unsubscribe: (() => void) | null = null;

	/** Changes chosen from the menu, waiting to be previewed together. Nothing is written until then. */
	private readonly staged = new Map<string, TagAction>();

	/** The tag being dragged, or null when no drag is under way. */
	private dragged: string | null = null;
	/** Pending hover-to-expand while dragging over a collapsed branch. */
	private expandTimer: { key: string; id: number } | null = null;

	/** A fixed bar below the tree: shows what a drop would do, and is the drop zone for the top level. */
	private dropBarEl!: HTMLElement;
	private summaryEl!: HTMLElement;
	private pendingEl!: HTMLElement;
	private treeEl!: HTMLElement;
	private notesEl!: HTMLElement;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: Tagafinity,
	) {
		super(leaf);
	}

	getViewType(): string {
		return TAG_TREE_VIEW;
	}

	getDisplayText(): string {
		return 'Tag tree';
	}

	getIcon(): string {
		return 'tags';
	}

	onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('tagafinity-tree-view');

		const toolbar = root.createDiv({ cls: 'tagafinity-tree-toolbar' });
		const search = toolbar.createEl('input', { type: 'search', placeholder: 'Filter tags' });
		search.setAttribute('aria-label', 'Filter tags');
		search.addEventListener('input', () => {
			this.query = search.value;
			this.filterClosed.clear();
			this.renderTree();
		});

		const buttons = toolbar.createDiv({ cls: 'tagafinity-tree-buttons' });
		const sortButton = new ExtraButtonComponent(buttons).setIcon('arrow-down-wide-narrow').setTooltip('Sorted by note count; click to sort by name');
		sortButton.onClick(() => {
			this.sort = this.sort === 'count' ? 'name' : 'count';
			sortButton.setIcon(this.sort === 'count' ? 'arrow-down-wide-narrow' : 'arrow-down-a-z');
			sortButton.setTooltip(this.sort === 'count' ? 'Sorted by note count; click to sort by name' : 'Sorted by name; click to sort by note count');
			this.renderTree();
		});
		new ExtraButtonComponent(buttons)
			.setIcon('chevrons-up-down')
			.setTooltip('Expand all')
			.onClick(() => {
				this.forEachNode(this.tree, (node) => node.children.length > 0 && this.expanded.add(node.tag.toLowerCase()));
				this.filterClosed.clear();
				this.renderTree();
			});
		new ExtraButtonComponent(buttons)
			.setIcon('chevrons-down-up')
			.setTooltip('Collapse all')
			.onClick(() => {
				this.expanded.clear();
				this.filterClosed = new Set(this.forEachNodeKeys(this.tree));
				this.renderTree();
			});
		new ExtraButtonComponent(buttons)
			.setIcon('refresh-cw')
			.setTooltip('Rebuild from the index')
			.onClick(() => this.refresh());

		this.summaryEl = root.createDiv({ cls: 'tagafinity-tree-summary setting-item-description' });
		this.pendingEl = root.createDiv({ cls: 'tagafinity-pending' });
		this.treeEl = root.createDiv({ cls: 'tagafinity-tree-body', attr: { role: 'tree' } });
		this.dropBarEl = root.createDiv({ cls: 'tagafinity-drop-bar' });
		this.registerDragZones();
		this.notesEl = root.createDiv({ cls: 'tagafinity-tree-notes' });

		this.unsubscribe = this.plugin.onIndexChanged(() => this.refresh());
		this.renderPending();
		this.refresh();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		return Promise.resolve();
	}

	/** Rebuilds the hierarchy from the plugin's index, keeping the open/closed state, filter and selection. */
	refresh(): void {
		if (!this.plugin.hasIndex()) {
			this.tree = [];
			this.treeEl.empty();
			this.notesEl.empty();
			this.summaryEl.setText('The tag index has not been built yet.');
			const button = this.treeEl.createEl('button', { text: 'Build index', cls: 'mod-cta' });
			button.addEventListener('click', () => void this.plugin.updateIndex());
			return;
		}
		const stats = collectTagStats(this.plugin.index, { centroids: false });
		this.tree = buildTree(stats);
		this.tagCount = stats.length;
		this.noteCount = Object.keys(this.plugin.index.notes).length;
		if (!this.expandedInitialized) {
			this.expanded = defaultExpanded(this.tree);
			this.expandedInitialized = true;
		}
		this.renderTree();
	}

	private forEachNode(nodes: TagNode[], visit: (node: TagNode) => void): void {
		for (const node of nodes) {
			visit(node);
			this.forEachNode(node.children, visit);
		}
	}

	private forEachNodeKeys(nodes: TagNode[]): string[] {
		const keys: string[] = [];
		this.forEachNode(nodes, (node) => keys.push(node.tag.toLowerCase()));
		return keys;
	}

	private renderTree(): void {
		this.summaryEl.setText(`${this.tagCount} tags across ${this.noteCount} notes. ${this.plugin.describeIndex()}`);
		this.treeEl.empty();

		const filtered = filterTree(sortTree(this.tree, this.sort), this.query);
		if (filtered.nodes.length === 0) {
			this.treeEl.createEl('p', { cls: 'setting-item-description', text: this.query ? 'No tags match.' : 'No tags found.' });
		} else {
			this.renderNodes(filtered.nodes, this.treeEl, 0, filtered.expand);
		}
		this.renderNotes();
	}

	private renderNodes(nodes: TagNode[], parent: HTMLElement, depth: number, forcedOpen: Set<string>): void {
		const widest = Math.max(1, ...nodes.map((node) => node.totalCount));
		const pendingSources = new Set([...this.staged.values()].map((action) => action.source.toLowerCase()));
		for (const node of nodes) {
			const key = node.tag.toLowerCase();
			const hasChildren = node.children.length > 0;
			const open =
				hasChildren && (this.expanded.has(key) || (forcedOpen.has(key) && !this.filterClosed.has(key)));

			const item = parent.createDiv({ cls: 'tagafinity-node' });
			const row = item.createDiv({
				cls: 'tagafinity-row',
				attr: { role: 'treeitem', tabindex: '0', 'aria-level': String(depth + 1), ...(hasChildren ? { 'aria-expanded': String(open) } : {}) },
			});
			row.style.setProperty('--tagafinity-depth', String(depth));
			if (node.tag === this.selected) row.addClass('is-selected');
			if (node.selfCount === 0) row.addClass('is-container');
			if (pendingSources.has(key)) row.addClass('has-pending');

			const chevron = row.createSpan({ cls: 'tagafinity-chevron' });
			if (hasChildren) setIcon(chevron, open ? 'chevron-down' : 'chevron-right');

			row.createSpan({ cls: 'tagafinity-label', text: `#${node.name}` });
			if (pendingSources.has(key)) row.createSpan({ cls: 'tagafinity-pending-dot', text: '●', attr: { 'aria-label': 'Has a pending change', title: 'Has a pending change' } });
			const count = row.createSpan({ cls: 'tagafinity-count', text: String(node.totalCount) });
			const own = node.selfCount === 0 ? 'none directly (it exists only as a parent of nested tags)' : `${node.selfCount} directly`;
			count.setAttribute('title', `${node.totalCount} ${node.totalCount === 1 ? 'note' : 'notes'}: ${own}`);
			const bar = row.createDiv({ cls: 'tagafinity-bar' });
			bar.style.setProperty('--tagafinity-bar', `${Math.round((node.totalCount / widest) * 100)}%`);

			const toggle = (): void => {
				if (!hasChildren) return;
				if (open) {
					this.expanded.delete(key);
					if (forcedOpen.has(key)) this.filterClosed.add(key);
				} else {
					this.expanded.add(key);
					this.filterClosed.delete(key);
				}
				this.renderTree();
			};
			chevron.addEventListener('click', (evt) => {
				evt.stopPropagation();
				toggle();
			});
			row.addEventListener('click', () => {
				this.selected = this.selected === node.tag ? null : node.tag;
				this.renderTree();
			});
			this.attachDragHandlers(row, node, open, hasChildren);
			row.addEventListener('contextmenu', (evt) => {
				evt.preventDefault();
				this.showMenu(evt, node);
			});
			row.addEventListener('keydown', (evt) => {
				if (evt.key === 'Enter' || evt.key === ' ') {
					evt.preventDefault();
					this.selected = node.tag;
					this.renderTree();
				} else if (evt.key === 'ArrowRight' && hasChildren && !open) toggle();
				else if (evt.key === 'ArrowLeft' && hasChildren && open) toggle();
			});

			if (open) this.renderNodes(node.children, item.createDiv({ attr: { role: 'group' } }), depth + 1, forcedOpen);
		}
	}

	/** Auto-scroll near the edges of the tree and the top-level drop zone. */
	private registerDragZones(): void {
		this.treeEl.addEventListener('dragover', (evt) => {
			if (!this.dragged) return;
			const rect = this.treeEl.getBoundingClientRect();
			if (evt.clientY - rect.top < 32) this.treeEl.scrollTop -= 14;
			else if (rect.bottom - evt.clientY < 32) this.treeEl.scrollTop += 14;
		});

		// The bar is always laid out (hidden, not removed), so showing it never moves the rows being aimed at.
		const bar = this.dropBarEl;
		bar.addEventListener('dragover', (evt) => {
			if (!this.dragged) return;
			const result = resolveDrop(this.dragged, null, false);
			this.showDropHint(result.ok ? result.action.description : result.error, result.ok);
			if (!result.ok) return;
			evt.preventDefault();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
			bar.addClass('is-drop-target');
		});
		bar.addEventListener('dragleave', () => bar.removeClass('is-drop-target'));
		bar.addEventListener('drop', (evt) => {
			evt.preventDefault();
			const dragged = this.dragged;
			this.endDrag();
			if (dragged) this.stage(resolveDrop(dragged, null, false));
		});
	}

	/** Makes a row draggable and a drop target: dropping tag A on tag B stages "move A under B" (Alt merges instead). */
	private attachDragHandlers(row: HTMLElement, node: TagNode, open: boolean, hasChildren: boolean): void {
		row.draggable = true;

		row.addEventListener('dragstart', (evt) => {
			this.dragged = node.tag;
			if (evt.dataTransfer) {
				evt.dataTransfer.setData('text/plain', `#${node.tag}`);
				evt.dataTransfer.effectAllowed = 'move';
			}
			row.addClass('is-dragging');
			this.showDropHint(
				node.tag.includes('/')
					? 'Drop on a tag to move it under that tag, or on this bar for the top level. Hold Alt to merge.'
					: 'Drop on a tag to move it under that tag. Hold Alt to merge.',
				true,
			);
		});
		// This listener is on the row itself, so it still runs if the row is re-rendered during the drag.
		row.addEventListener('dragend', () => this.endDrag());

		row.addEventListener('dragover', (evt) => {
			if (!this.dragged) return;
			const result = resolveDrop(this.dragged, node.tag, evt.altKey);
			const hint = result.ok ? `${result.action.description}${evt.altKey ? '' : ' (hold Alt to merge instead)'}` : result.error;
			this.showDropHint(hint, result.ok);
			row.toggleClass('is-drop-target', result.ok);
			row.toggleClass('is-drop-invalid', !result.ok);
			if (result.ok) {
				evt.preventDefault();
				if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
			}
			this.scheduleExpand(node, open, hasChildren);
		});
		row.addEventListener('dragleave', () => {
			row.removeClass('is-drop-target');
			row.removeClass('is-drop-invalid');
			this.cancelExpand();
		});
		row.addEventListener('drop', (evt) => {
			evt.preventDefault();
			const dragged = this.dragged;
			this.endDrag();
			if (dragged) this.stage(resolveDrop(dragged, node.tag, evt.altKey));
		});
	}

	/** Opens a collapsed branch after hovering over it for a moment, so tags can be dropped deep in the tree. */
	private scheduleExpand(node: TagNode, open: boolean, hasChildren: boolean): void {
		const key = node.tag.toLowerCase();
		if (!hasChildren || open || this.expandTimer?.key === key) return;
		this.cancelExpand();
		this.expandTimer = {
			key,
			id: window.setTimeout(() => {
				this.expandTimer = null;
				this.expanded.add(key);
				this.renderTree();
			}, 700),
		};
	}

	private cancelExpand(): void {
		if (this.expandTimer) window.clearTimeout(this.expandTimer.id);
		this.expandTimer = null;
	}

	private showDropHint(text: string, ok: boolean): void {
		this.dropBarEl.setText(text);
		this.dropBarEl.addClass('is-active');
		this.dropBarEl.toggleClass('is-invalid', !ok);
	}

	private endDrag(): void {
		this.dragged = null;
		this.cancelExpand();
		this.dropBarEl.removeClass('is-active', 'is-invalid', 'is-drop-target');
		this.dropBarEl.empty();
		this.contentEl.querySelectorAll('.is-dragging, .is-drop-target, .is-drop-invalid').forEach((el) => {
			el.removeClass('is-dragging', 'is-drop-target', 'is-drop-invalid');
		});
	}

	private showMenu(evt: MouseEvent, node: TagNode): void {
		const menu = new Menu();
		menu.addItem((item) => item.setTitle('Rename…').setIcon('pencil').onClick(() => this.promptRename(node)));
		menu.addItem((item) => item.setTitle('Move under…').setIcon('folder-input').onClick(() => this.pickMoveTarget(node)));
		menu.addItem((item) => item.setTitle('Merge into…').setIcon('merge').onClick(() => this.pickMergeTarget(node)));
		menu.addSeparator();
		if (node.selfCount > 0) {
			menu.addItem((item) => item.setTitle('Remove tag').setIcon('trash').onClick(() => this.stage({ ok: true, ...removeAction(node.tag, false) })));
		}
		if (node.children.length > 0) {
			menu.addItem((item) => item.setTitle('Remove tag and nested tags').setIcon('trash-2').onClick(() => this.stage({ ok: true, ...removeAction(node.tag, true) })));
		}
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle('Copy tag').setIcon('copy').onClick(() => {
				void navigator.clipboard.writeText(`#${node.tag}`);
				new Notice(`Copied #${node.tag}`);
			}),
		);
		menu.addItem((item) =>
			item.setTitle('Show notes').setIcon('list').onClick(() => {
				this.selected = node.tag;
				this.renderTree();
			}),
		);
		menu.showAtMouseEvent(evt);
	}

	private promptRename(node: TagNode): void {
		new PromptModal(this.app, {
			title: `Rename #${node.tag}`,
			label: 'New name',
			initial: node.name,
			submitLabel: 'Add to pending changes',
			validate: (value) => {
				const result = renameAction(node.tag, value);
				return result.ok ? null : result.error;
			},
			onSubmit: (value) => this.stage(renameAction(node.tag, value)),
		}).open();
	}

	private pickMoveTarget(node: TagNode): void {
		const parent = node.tag.includes('/') ? node.tag.slice(0, node.tag.lastIndexOf('/')).toLowerCase() : null;
		new TagPickerModal(this.app, {
			placeholder: `Move #${node.tag} under… (type a new tag to create it)`,
			tags: allTagPaths(this.tree),
			exclude: (tag) => isSameOrDescendant(tag, node.tag) || tag.toLowerCase() === parent,
			allowTopLevel: parent !== null,
			allowNew: true,
			onChoose: (item) => this.stage(moveAction(node.tag, item.tag)),
		}).open();
	}

	private pickMergeTarget(node: TagNode): void {
		new TagPickerModal(this.app, {
			placeholder: `Merge #${node.tag} into…`,
			tags: allTagPaths(this.tree),
			exclude: (tag) => isSameOrDescendant(tag, node.tag),
			onChoose: (item) => this.stage(mergeAction(node.tag, item.tag)),
		}).open();
	}

	/** Adds a change to the pending list (or explains why it cannot be). Nothing is written. */
	private stage(result: ActionResult): void {
		if (!result.ok) {
			new Notice(result.error);
			return;
		}
		const { action } = result;
		if (this.staged.has(action.key)) {
			new Notice('That change is already in the pending changes.');
			return;
		}
		const existing = action.target && action.target.toLowerCase() !== action.source.toLowerCase()
			? allTagPaths(this.tree).find((tag) => tag.toLowerCase() === action.target!.toLowerCase())
			: undefined;
		if (existing) new Notice(`#${existing} already exists, so notes with #${action.source} will join it.`, 6000);
		this.staged.set(action.key, action);
		this.renderPending();
		this.renderTree();
	}

	/** The list of staged changes, with a button to preview them all together. */
	private renderPending(): void {
		const el = this.pendingEl;
		el.empty();
		if (this.staged.size === 0) {
			el.addClass('is-empty');
			return;
		}
		el.removeClass('is-empty');

		el.createDiv({ cls: 'tagafinity-pending-header', text: `Pending changes (${this.staged.size})` });
		const list = el.createDiv({ cls: 'tagafinity-pending-list' });
		let number = 0;
		for (const action of this.staged.values()) {
			const row = list.createDiv({ cls: 'tagafinity-pending-item' });
			row.createSpan({ cls: 'tagafinity-pending-text', text: `${++number}. ${action.description}` });
			new ExtraButtonComponent(row)
				.setIcon('x')
				.setTooltip('Remove from pending changes')
				.onClick(() => {
					this.staged.delete(action.key);
					this.renderPending();
					this.renderTree();
				});
		}

		const buttons = el.createDiv({ cls: 'tagafinity-pending-buttons' });
		const preview = buttons.createEl('button', { text: `Preview ${this.staged.size === 1 ? 'change' : `${this.staged.size} changes`}`, cls: 'mod-cta' });
		preview.addEventListener('click', () =>
			void previewActions(this.app, this.plugin, [...this.staged.values()], () => {
				this.staged.clear();
				this.renderPending();
				this.renderTree();
			}),
		);
		buttons.createEl('button', { text: 'Clear' }).addEventListener('click', () => {
			this.staged.clear();
			this.renderPending();
			this.renderTree();
		});
	}

	private findNode(nodes: TagNode[], tag: string): TagNode | null {
		for (const node of nodes) {
			if (node.tag === tag) return node;
			const found = this.findNode(node.children, tag);
			if (found) return found;
		}
		return null;
	}

	/** The notes under the selected tag (including its nested tags). */
	private renderNotes(): void {
		this.notesEl.empty();
		const node = this.selected ? this.findNode(this.tree, this.selected) : null;
		if (!node) {
			this.notesEl.addClass('is-empty');
			return;
		}
		this.notesEl.removeClass('is-empty');

		const header = this.notesEl.createDiv({ cls: 'tagafinity-notes-header' });
		header.createSpan({ text: `#${node.tag} — ${node.totalCount} ${node.totalCount === 1 ? 'note' : 'notes'}` });
		new ExtraButtonComponent(header)
			.setIcon('x')
			.setTooltip('Close')
			.onClick(() => {
				this.selected = null;
				this.renderTree();
			});

		const list = this.notesEl.createDiv({ cls: 'tagafinity-notes-list' });
		const paths = [...node.notes].sort((a, b) => a.localeCompare(b));
		for (const path of paths.slice(0, NOTE_LIST_LIMIT)) {
			const slash = path.lastIndexOf('/');
			const item = list.createDiv({ cls: 'tagafinity-note', attr: { tabindex: '0', role: 'link' } });
			item.createSpan({ text: path.slice(slash + 1).replace(/\.md$/i, '') });
			if (slash >= 0) item.createSpan({ cls: 'tagafinity-note-folder', text: path.slice(0, slash) });
			const open = (evt: Event): void => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) void this.app.workspace.getLeaf(evt instanceof MouseEvent ? Keymap.isModEvent(evt) : false).openFile(file);
			};
			item.addEventListener('click', open);
			item.addEventListener('keydown', (evt) => {
				if (evt.key === 'Enter') open(evt);
			});
		}
		if (paths.length > NOTE_LIST_LIMIT) {
			list.createDiv({ cls: 'setting-item-description', text: `…and ${paths.length - NOTE_LIST_LIMIT} more.` });
		}
	}
}
