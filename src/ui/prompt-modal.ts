import { App, Modal, Setting } from 'obsidian';

export interface PromptOptions {
	title: string;
	label: string;
	initial: string;
	submitLabel: string;
	/** Returns a message when the value is not acceptable, or null. */
	validate: (value: string) => string | null;
	onSubmit: (value: string) => void;
}

/** Asks for one line of text, with live validation. */
export class PromptModal extends Modal {
	private value: string;

	constructor(
		app: App,
		private readonly options: PromptOptions,
	) {
		super(app);
		this.value = options.initial;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: this.options.title });
		const error = contentEl.createDiv({ cls: 'tagafinity-prompt-error' });

		let submit: HTMLButtonElement | null = null;
		const update = (): void => {
			const message = this.options.validate(this.value);
			error.setText(message ?? '');
			if (submit) submit.disabled = message !== null;
		};
		const send = (): void => {
			if (this.options.validate(this.value) !== null) return;
			this.close();
			this.options.onSubmit(this.value.trim().replace(/^#/, ''));
		};

		new Setting(contentEl).setName(this.options.label).addText((text) => {
			text.setValue(this.value).onChange((value) => {
				this.value = value;
				update();
			});
			text.inputEl.addEventListener('keydown', (evt) => {
				if (evt.key === 'Enter') {
					evt.preventDefault();
					send();
				}
			});
			window.setTimeout(() => {
				text.inputEl.focus();
				text.inputEl.select();
			}, 0);
		});

		const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
		submit = buttons.createEl('button', { text: this.options.submitLabel, cls: 'mod-cta' });
		submit.addEventListener('click', send);
		buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		update();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
