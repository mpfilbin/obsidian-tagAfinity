import { Keymap, TFile, type App } from 'obsidian';

/** Opens a note; a Ctrl/Cmd-click opens it in a new tab. */
export function openNote(app: App, path: string, evt: Event): void {
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) void app.workspace.getLeaf(evt instanceof MouseEvent ? Keymap.isModEvent(evt) : false).openFile(file);
}
