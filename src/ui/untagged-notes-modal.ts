import { App, SuggestModal, TFile } from 'obsidian';
import { filterNotePaths } from '../taxonomy/untagged';

/** Lists notes without tags; choosing one opens it in the current tab. */
export class UntaggedNotesModal extends SuggestModal<string> {
	constructor(
		app: App,
		private readonly paths: string[],
	) {
		super(app);
		this.setPlaceholder(`Filter ${paths.length} ${paths.length === 1 ? 'note' : 'notes'} without tags…`);
		this.setInstructions([{ command: '↵', purpose: 'open the note, then run “Suggest tags for current note”' }]);
	}

	getSuggestions(query: string): string[] {
		return filterNotePaths(this.paths, query);
	}

	renderSuggestion(path: string, el: HTMLElement): void {
		el.setText(path.replace(/\.md$/, ''));
	}

	onChooseSuggestion(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}
}
