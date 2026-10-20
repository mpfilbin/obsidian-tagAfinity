import { App, Modal, Notice } from 'obsidian';
import type { ChangePlan } from '../cleanup/plan';
import type Tagafinity from '../main';

/** Shows every line a change would touch and applies it only after confirmation. */
export class PreviewModal extends Modal {
	constructor(
		app: App,
		private readonly plugin: Tagafinity,
		private readonly plan: ChangePlan,
		private readonly onApplied: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('tagafinity-preview');
		contentEl.createEl('h2', { text: 'Preview changes' });
		contentEl.createEl('p', {
			text: `${this.plan.description} — ${this.plan.files.length} ${this.plan.files.length === 1 ? 'note' : 'notes'} will change.`,
		});

		const list = contentEl.createDiv({ cls: 'tagafinity-preview-list' });
		for (const file of this.plan.files) {
			const details = list.createEl('details');
			details.createEl('summary', { text: `${file.path} (${file.changes.length} lines)` });
			const diff = details.createEl('div', { cls: 'tagafinity-diff' });
			for (const change of file.changes) {
				diff.createEl('div', {
					cls: change.type === '+' ? 'tagafinity-diff-add' : 'tagafinity-diff-remove',
					text: `${change.type} ${change.line}: ${change.text}`,
				});
			}
		}

		const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
		const apply = buttons.createEl('button', { text: 'Apply changes', cls: 'mod-cta' });
		apply.addEventListener('click', () => void this.apply(apply));
		buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
	}

	private async apply(button: HTMLButtonElement): Promise<void> {
		button.disabled = true;
		button.setText('Applying…');
		const result = await this.plugin.applyChange(this.plan, (done, total) => button.setText(`Applying ${done}/${total}…`));
		this.close();
		const failed = result.failed.length;
		new Notice(
			failed === 0
				? `Updated ${result.applied.length} notes. Use “Undo last tag change” to revert.`
				: `Updated ${result.applied.length} notes; ${failed} skipped (${result.failed[0]?.reason}).`,
			8000,
		);
		this.onApplied();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
