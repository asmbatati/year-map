/* The event window: what a drag across days or a day's menu opens. A name, a kind, an icon, the days, whether it comes
 * back every year (or every Hijri year), and a colour; the event is written as a note. Opened on an event already on
 * the map, it shows that event and saves what was changed. */
import { Modal, Notice, Setting, type App } from 'obsidian';
import type { Category } from './settings-model.ts';
import type { StoredEvent } from './sources.ts';

export const SWATCHES = ['#e8590c', '#f59f00', '#2f9e44', '#1c7ed6', '#ae3ec9', '#e03131', '#868e96'];
/** Icons offered at a click, besides each kind's own. */
export const ICONS = ['🎂', '💍', '✈️', '🏖️', '🎓', '💼', '📍', '⏰', '🎤', '🌙', '🕋', '🇸🇦', '💰', '🛍️', '⭐'];

export type Repeat = 'never' | 'yearly' | 'hijri';

export interface EventDraft {
	title: string;
	start: string;
	end: string;
	/** Only when one was chosen: otherwise the kind's colour, or the default, stands. */
	color?: string;
	category?: string;
	icon?: string;
	repeat?: Repeat;
}

export interface EventWindowInput {
	label: string;
	start: string;
	end: string;
	repeat: Repeat;
	categories: readonly Category[];
	/** The event being edited, as its note holds it; absent when a new one is planned. */
	event?: StoredEvent;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class EventModal extends Modal {
	private input: EventWindowInput;
	private onPlan: (draft: EventDraft) => Promise<string>;
	private title = '';
	private draft: Omit<EventDraft, 'title'>;

	constructor(app: App, input: EventWindowInput, onPlan: (draft: EventDraft) => Promise<string>) {
		super(app);
		this.input = input;
		this.onPlan = onPlan;
		const e = input.event;
		this.title = e?.title ?? '';
		this.draft = e
			? { start: e.start, end: e.end, repeat: e.repeat, category: e.category, icon: e.icon, color: e.color }
			: { start: input.start, end: input.end, repeat: input.repeat };
	}

	onOpen(): void {
		const editing = this.input.event !== undefined;
		this.titleEl.setText(editing ? `Edit ${this.title}` : `Plan ${this.input.label}`);
		this.contentEl.addClass('ym-plan');
		new Setting(this.contentEl).setName('Name').addText((t) => {
			t.setPlaceholder('A birthday, a trip, a conference, the exams').setValue(this.title).onChange((v) => {
				this.title = v;
			});
			t.inputEl.addEventListener('keydown', (evt) => {
				if (evt.key === 'Enter') void this.submit(this.title);
			});
			t.inputEl.focus();
		});
		let iconInput: HTMLInputElement | undefined;
		const kindOf = (name?: string): Category | undefined => this.input.categories.find((c) => c.name === name);
		new Setting(this.contentEl).setName('Kind').addDropdown((d) => {
			d.addOption('', 'None');
			for (const c of this.input.categories) d.addOption(c.name, c.icon ? `${c.icon} ${c.name}` : c.name);
			// a kind the note names that the settings do not list is kept, not lost
			const kind = this.draft.category;
			if (kind && !kindOf(kind)) d.addOption(kind, kind);
			d.setValue(kind ?? '');
			d.onChange((v) => {
				this.draft.category = v || undefined;
				const kind = this.input.categories.find((c) => c.name === v);
				iconInput?.setAttr('placeholder', kind?.icon ?? '');
			});
		});
		const icons = new Setting(this.contentEl).setName('Icon').setDesc('An emoji or a few letters before the name; empty for the kind\'s own.');
		icons.addText((t) => {
			iconInput = t.inputEl;
			t.setValue(this.draft.icon ?? '').setPlaceholder(kindOf(this.draft.category)?.icon ?? '').onChange((v) => {
				this.draft.icon = v.trim() || undefined;
			});
		});
		const pick = icons.controlEl.createDiv({ cls: 'ym-icons' });
		for (const icon of ICONS) {
			const b = pick.createEl('button', { cls: 'ym-icon-pick', text: icon, attr: { type: 'button', 'aria-label': icon } });
			b.addEventListener('click', () => {
				this.draft.icon = icon;
				if (iconInput) iconInput.value = icon;
			});
		}
		const dates = new Setting(this.contentEl).setName('Days');
		dates.addText((t) => {
			t.inputEl.type = 'date';
			t.setValue(this.draft.start).onChange((v) => {
				if (ISO.test(v)) this.draft.start = v;
			});
		});
		dates.addText((t) => {
			t.inputEl.type = 'date';
			t.setValue(this.draft.end).onChange((v) => {
				if (ISO.test(v)) this.draft.end = v;
			});
		});
		new Setting(this.contentEl).setName('Repeats').addDropdown((d) => {
			d.addOption('never', 'Never');
			d.addOption('yearly', 'Every year');
			d.addOption('hijri', 'Every Hijri year (Umm al-Qura)');
			d.setValue(this.draft.repeat ?? 'never').onChange((v) => {
				this.draft.repeat = v === 'yearly' || v === 'hijri' ? v : 'never';
			});
		});
		const row = new Setting(this.contentEl).setName('Colour').setDesc('None chosen: the kind\'s.');
		const swatches = row.controlEl.createDiv({ cls: 'ym-swatches' });
		const buttons: HTMLElement[] = [];
		const chosen = this.draft.color;
		// a colour of the note's own that is not a swatch is offered first, so it can be kept
		const colors = chosen && !SWATCHES.includes(chosen.toLowerCase()) ? [chosen, ...SWATCHES] : SWATCHES;
		for (const c of colors) {
			const b = swatches.createEl('button', { cls: 'ym-swatch', attr: { 'aria-label': c, type: 'button' } });
			b.setCssProps({ '--ym-color': c });
			if (chosen && c.toLowerCase() === chosen.toLowerCase()) b.addClass('is-selected');
			b.addEventListener('click', () => {
				const again = this.draft.color?.toLowerCase() === c.toLowerCase();
				this.draft.color = again ? undefined : c;
				for (const other of buttons) other.removeClass('is-selected');
				if (!again) b.addClass('is-selected');
			});
			buttons.push(b);
		}
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((b) => b.setButtonText(editing ? 'Save' : 'Plan').setCta().onClick(() => void this.submit(this.title)));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Write the event, then close; one with no name is not written. `extra` stands for the window's other fields, for
	 * a caller that has them already. Returns the note's path: the new note's, or the edited one's after any rename. */
	async submit(title: string, color?: string, extra: Partial<Omit<EventDraft, 'title'>> = {}): Promise<string | null> {
		const name = title.trim();
		if (!name) {
			new Notice('Give the event a name.');
			return null;
		}
		const draft: EventDraft = { title: name, ...this.draft, ...(color ? { color } : {}), ...extra };
		if (draft.end < draft.start) draft.end = draft.start;
		const path = await this.onPlan(draft);
		this.close();
		return path;
	}
}
