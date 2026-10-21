import { ExtraButtonComponent, ItemView, Keymap, TFile, setIcon, type WorkspaceLeaf } from 'obsidian';
import type Tagafinity from '../main';
import { buildTree, collectTagStats, type TagNode } from '../taxonomy/build';
import { defaultExpanded, filterTree, sortTree, type TreeSort } from '../taxonomy/tree-view';

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

	private summaryEl!: HTMLElement;
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
		this.treeEl = root.createDiv({ cls: 'tagafinity-tree-body', attr: { role: 'tree' } });
		this.notesEl = root.createDiv({ cls: 'tagafinity-tree-notes' });

		this.unsubscribe = this.plugin.onIndexChanged(() => this.refresh());
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

			const chevron = row.createSpan({ cls: 'tagafinity-chevron' });
			if (hasChildren) setIcon(chevron, open ? 'chevron-down' : 'chevron-right');

			row.createSpan({ cls: 'tagafinity-label', text: `#${node.name}` });
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
