import { App, SuggestModal } from 'obsidian';
import { validateTagName } from '../cleanup/tag-actions';

export interface PickerItem {
	/** The chosen tag; empty for the top level. */
	tag: string;
	kind: 'existing' | 'new' | 'top';
}

export interface PickerOptions {
	placeholder: string;
	tags: string[];
	/** Tags that cannot be chosen, for example the tag being moved and everything inside it. */
	exclude: (tag: string) => boolean;
	/** Offer "top level" as a choice (for moves). */
	allowTopLevel?: boolean;
	/** Offer typing a tag that does not exist yet (for moves under a new parent). */
	allowNew?: boolean;
	onChoose: (item: PickerItem) => void;
}

const MAX_RESULTS = 50;

/** Fuzzy-ish tag picker: every word typed must appear in the tag path. */
export class TagPickerModal extends SuggestModal<PickerItem> {
	constructor(
		app: App,
		private readonly options: PickerOptions,
	) {
		super(app);
		this.setPlaceholder(options.placeholder);
	}

	getSuggestions(query: string): PickerItem[] {
		const typed = query.trim().replace(/^#/, '');
		const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
		const candidates = this.options.tags
			.filter((tag) => !this.options.exclude(tag))
			.filter((tag) => words.every((word) => tag.toLowerCase().includes(word)))
			.sort((a, b) => Number(b.toLowerCase().startsWith(words[0] ?? '')) - Number(a.toLowerCase().startsWith(words[0] ?? '')) || a.length - b.length || a.localeCompare(b))
			.slice(0, MAX_RESULTS)
			.map((tag): PickerItem => ({ tag, kind: 'existing' }));

		const items: PickerItem[] = [];
		if (this.options.allowTopLevel && typed === '') items.push({ tag: '', kind: 'top' });
		const exists = this.options.tags.some((tag) => tag.toLowerCase() === typed.toLowerCase());
		if (this.options.allowNew && typed !== '' && !exists && validateTagName(typed) === null && !this.options.exclude(typed)) {
			items.push({ tag: typed, kind: 'new' });
		}
		return [...items, ...candidates];
	}

	renderSuggestion(item: PickerItem, el: HTMLElement): void {
		if (item.kind === 'top') el.setText('(top level)');
		else if (item.kind === 'new') el.setText(`Create #${item.tag}`);
		else el.setText(`#${item.tag}`);
	}

	onChooseSuggestion(item: PickerItem): void {
		this.options.onChoose(item);
	}
}
