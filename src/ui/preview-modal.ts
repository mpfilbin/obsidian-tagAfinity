import { App, Modal, Notice } from 'obsidian';
import { restrictPlan, type ChangePlan } from '../cleanup/plan';
import type Tagafinity from '../main';

/** Shows every line a change would touch and applies it only after confirmation. */
export class PreviewModal extends Modal {
	/** Notes that will be changed; the user can untick any. */
	private readonly chosen: Set<string>;
	private applyButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private readonly plugin: Tagafinity,
		private readonly plan: ChangePlan,
		private readonly onApplied: () => void,
	) {
		super(app);
		this.chosen = new Set(plan.files.map((file) => file.path));
	}

	private updateApplyButton(): void {
		const button = this.applyButton;
		if (!button) return;
		const count = this.chosen.size;
		button.setText(count === 0 ? 'Nothing selected' : `Apply to ${count} ${count === 1 ? 'note' : 'notes'}`);
		button.disabled = count === 0;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('tagafinity-preview');
		contentEl.createEl('h2', { text: 'Preview changes' });
		contentEl.createEl('p', {
			text: `${this.plan.description} — ${this.plan.files.length} ${this.plan.files.length === 1 ? 'note' : 'notes'} would change. Untick any note you want to leave alone.`,
		});

		const list = contentEl.createDiv({ cls: 'tagafinity-preview-list' });
		const boxes: HTMLInputElement[] = [];
		for (const file of this.plan.files) {
			const row = list.createDiv({ cls: 'tagafinity-preview-row' });
			const box = row.createEl('input', { type: 'checkbox' });
			box.checked = true;
			box.setAttribute('aria-label', `Include ${file.path}`);
			box.addEventListener('change', () => {
				if (box.checked) this.chosen.add(file.path);
				else this.chosen.delete(file.path);
				this.updateApplyButton();
			});
			boxes.push(box);

			const details = row.createEl('details');
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
		const setAll = (checked: boolean): void => {
			boxes.forEach((box, i) => {
				box.checked = checked;
				const path = this.plan.files[i]!.path;
				if (checked) this.chosen.add(path);
				else this.chosen.delete(path);
			});
			this.updateApplyButton();
		};
		buttons.createEl('button', { text: 'Select all' }).addEventListener('click', () => setAll(true));
		buttons.createEl('button', { text: 'Select none' }).addEventListener('click', () => setAll(false));
		this.applyButton = buttons.createEl('button', { cls: 'mod-cta' });
		this.applyButton.addEventListener('click', () => void this.apply(this.applyButton!));
		buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		this.updateApplyButton();
	}

	private async apply(button: HTMLButtonElement): Promise<void> {
		button.disabled = true;
		button.setText('Applying…');
		const result = await this.plugin.applyChange(restrictPlan(this.plan, this.chosen), (done, total) => button.setText(`Applying ${done}/${total}…`));
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
