/* The settings tab, declared (Obsidian 1.13): every row is a definition, read and written through
 * getControlValue and setControlValue by its key, `days.journal` for a field of a layer. */
import { PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
import type YearMapPlugin from './main.ts';
import { normalizeFolder } from './integrations.ts';
import { DEFAULT_SETTINGS, formatCategories, parseCategories, type YearMapSettings } from './settings-model.ts';

const WEEKDAYS: Record<string, string> = {
	'0': 'Sunday',
	'1': 'Monday',
	'2': 'Tuesday',
	'3': 'Wednesday',
	'4': 'Thursday',
	'5': 'Friday',
	'6': 'Saturday',
};

const WEEKENDS: Record<string, string> = {
	'0,6': 'Saturday and Sunday',
	'5,6': 'Friday and Saturday',
	'5': 'Friday',
	'6': 'Saturday',
	'0': 'Sunday',
	'': 'None',
};

/** Settings kept as lists and edited as text: folders one per line, the rest separated by commas. */
const LISTS: Record<string, string> = {
	'events.folders': '\n',
	'events.tags': ', ',
	'events.startKeys': ', ',
	'events.endKeys': ', ',
	'events.milestoneKeys': ', ',
	'tasks.completed': ', ',
};
const FOLDERS = new Set(['events.folders', 'events.newFolder', 'days.folder']);
const COUNTS = new Set(['maxChips', 'maxLanes']);

const splitList = (value: string): string[] => value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export class YearMapSettingTab extends PluginSettingTab {
	plugin: YearMapPlugin;

	constructor(app: App, plugin: YearMapPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private get s(): YearMapSettings {
		return this.plugin.settings;
	}

	/** The object a key's last part lives in, and that part: `days.journal` is `journal` of `days`. */
	private slot(key: string): [Record<string, unknown>, string] {
		const parts = key.split('.');
		let at = this.s as unknown as Record<string, unknown>;
		for (const p of parts.slice(0, -1)) at = at[p] as Record<string, unknown>;
		return [at, parts[parts.length - 1] ?? key];
	}

	getControlValue(key: string): unknown {
		if (key === 'weekendDays') return [...this.s.weekendDays].sort((a, b) => a - b).join(',');
		if (key === 'weekStart') return String(this.s.weekStart);
		if (key === 'events.categories') return formatCategories(this.s.events.categories);
		const [at, last] = this.slot(key);
		const value = at[last];
		const sep = LISTS[key];
		if (sep !== undefined && Array.isArray(value)) return value.join(sep);
		return value;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'weekendDays') {
			this.s.weekendDays = String(value).split(',').filter((x) => x.trim() !== '').map(Number)
				.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
		} else if (key === 'weekStart') {
			const n = Number(value);
			this.s.weekStart = (Number.isInteger(n) && n >= 0 && n <= 6 ? n : 0) as YearMapSettings['weekStart'];
		} else if (key === 'events.body') {
			this.s.events.body = String(value).replace(/\r\n/g, '\n');
		} else if (key === 'events.categories') {
			this.s.events.categories = parseCategories(String(value));
		} else if (key === 'blockName') {
			this.s.blockName = String(value).trim() || DEFAULT_SETTINGS.blockName;
		} else {
			const [at, last] = this.slot(key);
			if (key in LISTS) {
				const items = splitList(String(value));
				at[last] = FOLDERS.has(key) ? items.map(normalizeFolder).filter(Boolean) : items;
			} else if (FOLDERS.has(key)) at[last] = normalizeFolder(String(value));
			else if (COUNTS.has(key)) at[last] = Math.max(1, Math.round(Number(value)) || 1);
			else if (typeof value === 'string') at[last] = value.trim();
			else at[last] = value;
		}
		await this.plugin.saveSettings();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const tasknotes = this.plugin.integrations.tasknotesSettings() !== undefined;
		return [
			{
				name: 'Block name',
				desc: 'The word after the three backticks that open a year map in a note. A change takes effect when the plugin is reloaded.',
				control: { type: 'text', key: 'blockName', placeholder: DEFAULT_SETTINGS.blockName },
			},
			{
				type: 'group',
				heading: 'The page',
				items: [
					{ name: 'Title', desc: '{year} stands for the year shown.', control: { type: 'text', key: 'title', placeholder: DEFAULT_SETTINGS.title } },
					{ name: 'Line under the title', desc: 'Empty for none.', control: { type: 'text', key: 'tagline' } },
					{ name: 'Week starts on', desc: 'The first column, and the order of the columns after it.', control: { type: 'dropdown', key: 'weekStart', options: WEEKDAYS } },
					{ name: 'Weekend', desc: 'The days shaded down the year.', control: { type: 'dropdown', key: 'weekendDays', options: WEEKENDS } },
					{
						name: 'Density',
						desc: 'Comfortable fits a large screen or a print; compact a narrow pane.',
						control: { type: 'dropdown', key: 'density', options: { comfortable: 'Comfortable', compact: 'Compact' } },
					},
					{ name: 'Tasks shown on a day', desc: 'More than this are counted.', control: { type: 'number', key: 'maxChips', min: 1 } },
					{ name: 'Event rows in a month', desc: 'Events beyond these are counted on their days.', control: { type: 'number', key: 'maxLanes', min: 1 } },
					{
						name: 'A click on a day',
						desc: 'A right-click always shows the menu, and a click with Ctrl or Cmd opens the day\'s note in a new tab.',
						control: {
							type: 'dropdown',
							key: 'dayClick',
							options: { menu: 'Shows a menu: add an event, or open the day\'s note', note: 'Opens the day\'s note', event: 'Adds an event' },
						},
					},
					{
						name: 'A click on an event',
						desc: 'A right-click on an event always asks, and a click with Ctrl or Cmd opens its note in a new tab.',
						control: {
							type: 'dropdown',
							key: 'eventClick',
							options: { note: 'Opens its note', edit: 'Edits it: name, kind, icon, days, repeat, colour', menu: 'Shows a menu: open its note, or edit it' },
						},
					},
					{ name: 'Legend', desc: 'Under the title, the kinds of event the year shows.', control: { type: 'toggle', key: 'legend' } },
					{ name: 'Tint each quarter', desc: 'Each quarter on a colour of its own, as the Linear Calendar template does it.', control: { type: 'toggle', key: 'quarters.enabled' } },
					{ name: 'First quarter', visible: () => this.s.quarters.enabled, control: { type: 'color', key: 'quarters.colors.0' } },
					{ name: 'Second quarter', visible: () => this.s.quarters.enabled, control: { type: 'color', key: 'quarters.colors.1' } },
					{ name: 'Third quarter', visible: () => this.s.quarters.enabled, control: { type: 'color', key: 'quarters.colors.2' } },
					{ name: 'Fourth quarter', visible: () => this.s.quarters.enabled, control: { type: 'color', key: 'quarters.colors.3' } },
				],
			},
			{
				type: 'group',
				heading: 'Daily notes',
				items: [
					{ name: 'Show daily notes', desc: 'Mark the days that have one. A click on a day opens its note, or makes it.', control: { type: 'toggle', key: 'days.enabled' } },
					{
						name: 'Daily notes from',
						desc: 'Found by the plugin looks for Journals, then Daily notes or Periodic Notes.',
						control: {
							type: 'dropdown',
							key: 'days.source',
							options: { auto: 'Found by the plugin', journals: 'Journals', 'daily-notes': 'Daily notes or Periodic Notes', custom: 'A folder and a date format' },
						},
					},
					{ name: 'Daily journal', desc: 'With Journals: the journal of the days.', control: { type: 'text', key: 'days.journal' } },
					{ name: 'Monthly journal', desc: 'With Journals: the journal a month\'s name opens.', control: { type: 'text', key: 'days.monthJournal' } },
					{ name: 'Yearly journal', desc: 'With Journals: the journal the title opens.', control: { type: 'text', key: 'days.yearJournal' } },
					{
						name: 'Folder',
						desc: 'With a folder and a date format: where the daily notes are.',
						visible: () => this.s.days.source === 'custom',
						control: { type: 'folder', key: 'days.folder' },
					},
					{
						name: 'Date format',
						desc: 'With a folder and a date format: the note\'s name, in moment.js tokens.',
						visible: () => this.s.days.source === 'custom',
						control: { type: 'text', key: 'days.format', placeholder: DEFAULT_SETTINGS.days.format },
					},
				],
			},
			{
				type: 'group',
				heading: 'Tasks',
				items: [
					{
						name: 'Show tasks',
						desc: tasknotes
							? 'TaskNotes is on: its task tag, its property names and its colours are used.'
							: 'Notes with the task tag below. With TaskNotes, its own settings are used instead.',
						control: { type: 'toggle', key: 'tasks.enabled' },
					},
					{
						name: 'Date a task sits on',
						control: {
							type: 'dropdown',
							key: 'tasks.dateField',
							options: { 'scheduled-or-due': 'Scheduled, or due when not scheduled', due: 'Due', scheduled: 'Scheduled', both: 'Both, on each day' },
						},
					},
					{ name: 'Hide completed tasks', control: { type: 'toggle', key: 'tasks.hideCompleted' } },
					{ name: 'Drag to reschedule', desc: 'Drop a task on another day to move its date there.', control: { type: 'toggle', key: 'tasks.dragReschedule' } },
					{
						name: 'Colour tasks by',
						control: { type: 'dropdown', key: 'tasks.colorBy', options: { status: 'Status', priority: 'Priority' } },
					},
					{ name: 'Task tag', visible: () => !tasknotes, control: { type: 'text', key: 'tasks.tag' } },
					{ name: 'Due property', visible: () => !tasknotes, control: { type: 'text', key: 'tasks.dueKey' } },
					{ name: 'Scheduled property', visible: () => !tasknotes, control: { type: 'text', key: 'tasks.scheduledKey' } },
					{ name: 'Status property', visible: () => !tasknotes, control: { type: 'text', key: 'tasks.statusKey' } },
					{ name: 'Priority property', visible: () => !tasknotes, control: { type: 'text', key: 'tasks.priorityKey' } },
					{
						name: 'Completed statuses',
						desc: 'Separated by commas.',
						visible: () => !tasknotes,
						control: { type: 'text', key: 'tasks.completed' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Events',
				items: [
					{ name: 'Show events', desc: 'Notes with a start and an end, drawn as bars across their days.', control: { type: 'toggle', key: 'events.enabled' } },
					{
						name: 'Event folders',
						desc: 'One per line. A note in one of these is an event.',
						control: { type: 'textarea', key: 'events.folders', rows: 3 },
					},
					{ name: 'Event tags', desc: 'Separated by commas. A note with one of these is an event too.', control: { type: 'text', key: 'events.tags' } },
					{ name: 'Start properties', desc: 'Separated by commas; the first one present is used.', control: { type: 'text', key: 'events.startKeys' } },
					{ name: 'End properties', desc: 'With no end, an event is one day.', control: { type: 'text', key: 'events.endKeys' } },
					{ name: 'Colour property', control: { type: 'text', key: 'events.colorKey' } },
					{ name: 'Default colour', control: { type: 'color', key: 'events.defaultColor' } },
					{
						name: 'Kinds of event',
						desc: 'One per line: a name, a colour and an icon, separated by commas, e.g. "Birthday, #d6336c, 🎂". A note names its kind in the property below; its own colour and icon win.',
						control: { type: 'textarea', key: 'events.categories', rows: 8 },
					},
					{ name: 'Kind property', control: { type: 'text', key: 'events.categoryKey' } },
					{ name: 'Icon property', desc: 'An emoji or a few letters drawn before the name.', control: { type: 'text', key: 'events.iconKey' } },
					{ name: 'Repeat property', desc: '"yearly" draws the event every year from its first.', control: { type: 'text', key: 'events.repeatKey' } },
					{
						name: 'Calendar property',
						desc: 'With "hijri", a yearly event follows the Umm al-Qura calendar, as Ramadan and the Eids do.',
						control: { type: 'text', key: 'events.calendarKey' },
					},
					{
						name: 'Dates inside an event',
						desc: 'Properties drawn as a day of their own, such as a conference\'s deadline. Separated by commas.',
						control: { type: 'text', key: 'events.milestoneKeys' },
					},
					{ name: 'Kind of those dates', control: { type: 'text', key: 'events.milestoneCategory' } },
					{
						name: 'Folder for new events',
						desc: 'Drag across days to plan something: it is written here as a note.',
						control: { type: 'folder', key: 'events.newFolder' },
					},
					{
						name: 'Properties for new events',
						desc: 'Frontmatter lines added to every new event, such as a parent note. {{title}}, {{start}}, {{end}} and {{now:FORMAT}} are filled in.',
						control: { type: 'textarea', key: 'events.extraProperties', placeholder: 'up: "[[Plans]]"', rows: 3 },
					},
					{
						name: 'Text of a new event',
						desc: 'What follows the frontmatter, with the same placeholders.',
						control: { type: 'textarea', key: 'events.body', placeholder: '# {{title}}', rows: 3 },
					},
				],
			},
		];
	}
}
