import {
	ItemView,
	Keymap,
	MarkdownRenderChild,
	Menu,
	Plugin,
	debounce,
	moment,
	type HoverParent,
	type HoverPopover,
	type ViewStateResult,
	type WorkspaceLeaf,
} from 'obsidian';
import { Integrations } from './integrations.ts';
import { EventModal, type Repeat } from './modal.ts';
import { buildModel, rangeLabel, signatureOf, type YearModel } from './model.ts';
import { parseBlockOptions, type BlockOptions } from './options.ts';
import { renderYear, type Handlers } from './render.ts';
import { DEFAULT_SETTINGS, mergeSettings, type YearMapSettings } from './settings-model.ts';
import { YearMapSettingTab } from './settings.ts';
import { tagsOf, taskSettingsFrom, type NoteFacts } from './sources.ts';

export const VIEW_TYPE = 'year-map';
const ICON = 'calendar-range';

/** A place a year is drawn: the view, or a block in a note. */
interface Surface extends HoverParent {
	readonly el: HTMLElement;
	readonly options: BlockOptions;
	readonly sourcePath: string;
	year: number;
	signature: string;
	setYear(year: number): void;
}

const thisYear = (): number => moment().year();
const pad2 = (n: number): string => String(n).padStart(2, '0');

export default class YearMapPlugin extends Plugin {
	settings: YearMapSettings = mergeSettings(null);
	integrations: Integrations = new Integrations(this.app, () => this.settings);
	private surfaces = new Set<Surface>();
	private refreshSoon = debounce(() => this.refreshAll(), 250, true);

	async onload(): Promise<void> {
		await this.loadSettings();
		this.integrations = new Integrations(this.app, () => this.settings);

		this.registerView(VIEW_TYPE, (leaf) => new YearMapView(leaf, this));
		this.registerHoverLinkSource(VIEW_TYPE, { display: 'Year Map', defaultMod: true });
		this.registerMarkdownCodeBlockProcessor(this.settings.blockName || DEFAULT_SETTINGS.blockName, (source, el, ctx) => {
			ctx.addChild(new YearMapBlock(el, this, parseBlockOptions(source), ctx.sourcePath));
		});
		this.addRibbonIcon(ICON, 'Open year map', () => {
			void this.openView();
		});
		this.addCommand({ id: 'open', name: 'Open in a tab', callback: () => this.openView() });
		this.addCommand({
			id: 'insert-block',
			name: 'Insert block',
			editorCallback: (editor) => editor.replaceSelection('```' + (this.settings.blockName || DEFAULT_SETTINGS.blockName) + '\n```\n'),
		});
		this.addSettingTab(new YearMapSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.metadataCache.on('changed', () => this.refreshSoon()));
			this.registerEvent(this.app.vault.on('create', () => this.refreshSoon()));
			this.registerEvent(this.app.vault.on('delete', () => this.refreshSoon()));
			this.registerEvent(this.app.vault.on('rename', () => this.refreshSoon()));
		});
	}

	onunload(): void {
		this.refreshSoon.cancel();
		this.surfaces.clear();
	}

	async loadSettings(): Promise<void> {
		this.settings = mergeSettings((await this.loadData()) as Partial<YearMapSettings> | null);
	}

	/** Save the settings, then draw every year again with them. */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		for (const s of this.surfaces) this.draw(s, true);
	}

	async openView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	attach(surface: Surface): void {
		this.surfaces.add(surface);
		this.draw(surface, true);
	}

	detach(surface: Surface): void {
		this.surfaces.delete(surface);
	}

	private refreshAll(): void {
		for (const s of this.surfaces) this.draw(s, false);
	}

	private notes(): NoteFacts[] {
		return this.app.vault.getMarkdownFiles().map((f) => {
			const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
			return { path: f.path, name: f.basename, fm, tags: tagsOf(fm) };
		});
	}

	/** Draw a year where it is shown, unless nothing it would draw has changed since the last time. */
	draw(surface: Surface, force: boolean): void {
		const o = surface.options;
		const s = this.settings;
		const on = (layer: 'days' | 'tasks' | 'events'): boolean => !o.layers || o.layers.includes(layer);
		const settings: YearMapSettings = {
			...s,
			title: o.title ?? s.title,
			density: o.density ?? s.density,
			days: { ...s.days, enabled: s.days.enabled && on('days') },
			tasks: { ...s.tasks, enabled: s.tasks.enabled && on('tasks') },
			events: { ...s.events, enabled: s.events.enabled && on('events') },
		};
		const notes = this.notes();
		const locale = moment.localeData();
		const model = buildModel({
			year: surface.year,
			settings,
			notes,
			taskSettings: taskSettingsFrom(this.integrations.tasknotesSettings(), settings),
			daily: settings.days.enabled ? this.integrations.dailyIndex(notes) : new Map<string, string>(),
			today: moment().format('YYYY-MM-DD'),
			monthNames: locale.monthsShort(),
			weekdayNames: locale.weekdaysMin(),
		});
		const signature = signatureOf(model);
		if (!force && signature === surface.signature) return;
		surface.signature = signature;
		renderYear(surface.el, model, this.handlers(surface, model));
	}

	/** The event window for a span of days; it writes the event as a note. */
	private planEvent(start: string, end: string, repeat: Repeat, monthNames: string[]): void {
		new EventModal(this.app, { label: rangeLabel(start, end, monthNames), start, end, repeat, categories: this.settings.events.categories },
			(draft) => this.integrations.createEvent(draft)).open();
	}

	/** The event window on an event already drawn, filled in from its note; it writes back what was changed. */
	private editEvent(path: string): void {
		const event = this.integrations.storedEvent(path);
		if (!event) return;
		new EventModal(this.app, { label: event.title, start: event.start, end: event.end, repeat: event.repeat,
			categories: this.settings.events.categories, event }, (draft) => this.integrations.updateEvent(path, event, draft)).open();
	}

	/** An event's menu: open its note, or edit it. */
	private eventMenu(path: string, evt: MouseEvent | undefined, surface: Surface): void {
		const menu = new Menu();
		menu.addItem((i) => i.setTitle('Open the note').setIcon('file-text')
			.onClick(() => void this.app.workspace.openLinkText(path, surface.sourcePath, false)));
		menu.addItem((i) => i.setTitle('Edit the event').setIcon('pencil').onClick(() => this.editEvent(path)));
		if (evt) menu.showAtMouseEvent(evt);
		else menu.showAtPosition({ x: 0, y: 0 });
	}

	/** A day's menu: add an event there, or one every year, open the day's note, or open or edit an event on it. */
	private dayMenu(iso: string, evt: MouseEvent | undefined, model: YearModel, surface: Surface): void {
		const label = rangeLabel(iso, iso, model.monthNames);
		const menu = new Menu();
		menu.addItem((i) => i.setTitle(`Add an event on ${label}`).setIcon('calendar-plus')
			.onClick(() => this.planEvent(iso, iso, 'never', model.monthNames)));
		menu.addItem((i) => i.setTitle(`Add a yearly event on ${label}`).setIcon('repeat')
			.onClick(() => this.planEvent(iso, iso, 'yearly', model.monthNames)));
		if (model.show.days) {
			menu.addItem((i) => i.setTitle('Open the day\'s note').setIcon('calendar-days')
				.onClick(() => void this.integrations.openDay(iso, false)));
		}
		const on = model.items.filter((e) => e.start <= iso && iso <= e.end).slice(0, 8);
		if (on.length) menu.addSeparator();
		for (const e of on) {
			menu.addItem((i) => i.setTitle(`Open ${e.icon ? `${e.icon} ` : ''}${e.title}`).setIcon('file-text')
				.onClick(() => void this.app.workspace.openLinkText(e.path, surface.sourcePath, false)));
		}
		// a deadline inside an event is the same note: one edit for it
		const editable = [...new Map(on.map((e) => [e.path, e])).values()];
		for (const e of editable) {
			const title = e.milestone ? (this.integrations.storedEvent(e.path)?.title ?? e.title) : e.title;
			menu.addItem((i) => i.setTitle(`Edit ${e.icon && !e.milestone ? `${e.icon} ` : ''}${title}`).setIcon('pencil')
				.onClick(() => this.editEvent(e.path)));
		}
		if (evt) menu.showAtMouseEvent(evt);
		else menu.showAtPosition({ x: 0, y: 0 });
	}

	private handlers(surface: Surface, model: YearModel): Handlers {
		const { app } = this;
		const year = surface.year;
		const monthNames = model.monthNames;
		return {
			openDay: (iso, evt) => void this.integrations.openDay(iso, Keymap.isModEvent(evt)),
			clickDay: (iso, evt) => {
				// a modified click opens the day's note where it asks to, whatever a click does
				const mod = evt ? Keymap.isModEvent(evt) : false;
				if (mod) {
					void this.integrations.openDay(iso, mod);
					return;
				}
				if (this.settings.dayClick === 'note') void this.integrations.openDay(iso, false);
				else if (this.settings.dayClick === 'event') this.planEvent(iso, iso, 'never', monthNames);
				else this.dayMenu(iso, evt, model, surface);
			},
			dayMenu: (iso, evt) => this.dayMenu(iso, evt, model, surface),
			openMonth: (month, evt) => void this.integrations.openPeriod('month', `${year}-${pad2(month + 1)}-01`, Keymap.isModEvent(evt)),
			openYear: (evt) => void this.integrations.openPeriod('year', `${year}-01-01`, Keymap.isModEvent(evt)),
			openNote: (path, evt) => void app.workspace.openLinkText(path, surface.sourcePath, Keymap.isModEvent(evt)),
			clickEvent: (path, evt) => {
				// a modified click opens the note where it asks to, whatever a click does
				const mod = evt ? Keymap.isModEvent(evt) : false;
				if (mod || this.settings.eventClick === 'note') void app.workspace.openLinkText(path, surface.sourcePath, mod);
				else if (this.settings.eventClick === 'edit') this.editEvent(path);
				else this.eventMenu(path, evt?.type === 'click' ? evt as MouseEvent : undefined, surface);
			},
			eventMenu: (path, evt) => this.eventMenu(path, evt, surface),
			planRange: (start, end) => this.planEvent(start, end, 'never', monthNames),
			reschedule: (path, _from, kind, to) => void this.integrations.reschedule(path, kind, to),
			prevYear: () => surface.setYear(surface.year - 1),
			nextYear: () => surface.setYear(surface.year + 1),
			thisYear: () => surface.setYear(thisYear()),
			hover: (path, target, evt) => {
				app.workspace.trigger('hover-link', {
					event: evt,
					source: VIEW_TYPE,
					hoverParent: surface,
					targetEl: target,
					linktext: path,
					sourcePath: surface.sourcePath,
				});
			},
		};
	}
}

/** The year map in its own tab; the year it shows is kept with the workspace. */
class YearMapView extends ItemView implements Surface {
	hoverPopover: HoverPopover | null = null;
	readonly options: BlockOptions = {};
	readonly sourcePath = '';
	year = thisYear();
	signature = '';
	private plugin: YearMapPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: YearMapPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	get el(): HTMLElement {
		return this.contentEl;
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Year map';
	}

	getIcon(): string {
		return ICON;
	}

	getState(): Record<string, unknown> {
		return { year: this.year };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const year = (state as { year?: unknown } | null)?.year;
		if (typeof year === 'number' && Number.isInteger(year)) this.year = year;
		await super.setState(state, result);
		this.plugin.draw(this, true);
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('year-map-view');
		this.plugin.attach(this);
		await Promise.resolve();
	}

	async onClose(): Promise<void> {
		this.plugin.detach(this);
		await Promise.resolve();
	}

	setYear(year: number): void {
		this.year = year;
		this.plugin.draw(this, true);
		this.app.workspace.requestSaveLayout();
	}
}

/** A year map in a note, drawn where its code block stands. */
class YearMapBlock extends MarkdownRenderChild implements Surface {
	hoverPopover: HoverPopover | null = null;
	readonly options: BlockOptions;
	readonly sourcePath: string;
	year: number;
	signature = '';
	private plugin: YearMapPlugin;

	constructor(containerEl: HTMLElement, plugin: YearMapPlugin, options: BlockOptions, sourcePath: string) {
		super(containerEl);
		this.plugin = plugin;
		this.options = options;
		this.sourcePath = sourcePath;
		this.year = options.year ?? thisYear() + (options.yearOffset ?? 0);
	}

	get el(): HTMLElement {
		return this.containerEl;
	}

	onload(): void {
		this.plugin.attach(this);
	}

	onunload(): void {
		this.plugin.detach(this);
	}

	setYear(year: number): void {
		this.year = year;
		this.plugin.draw(this, true);
	}
}
