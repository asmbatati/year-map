/* The settings and their defaults. Pure: no `obsidian` import, so the model and its tests run in Node. */
import type { Weekday } from './grid.ts';

export type TaskDateField = 'due' | 'scheduled' | 'scheduled-or-due' | 'both';

export interface DayOptions {
	enabled: boolean;
	/** Who owns the daily notes: found by the plugin (`auto`), Journals, core Daily notes, or a folder and format. */
	source: 'auto' | 'journals' | 'daily-notes' | 'custom';
	/** The Journals plugin's journals for a day, a month and a year. */
	journal: string;
	monthJournal: string;
	yearJournal: string;
	/** With `custom`: the folder and the date format (moment's) of the daily notes. */
	folder: string;
	format: string;
}

export interface TaskOptions {
	enabled: boolean;
	dateField: TaskDateField;
	hideCompleted: boolean;
	dragReschedule: boolean;
	colorBy: 'status' | 'priority';
	/** Used when TaskNotes is not installed; with TaskNotes, its own settings are read instead. */
	tag: string;
	titleKey: string;
	dueKey: string;
	scheduledKey: string;
	statusKey: string;
	priorityKey: string;
	archiveTag: string;
	completed: string[];
}

/** A kind of event: its name (what a note's `category` says), its colour and its icon (an emoji or a few letters). */
export interface Category {
	name: string;
	color: string;
	icon: string;
}

export interface EventOptions {
	enabled: boolean;
	/** A note is an event when it sits under one of these folders or carries one of these tags. */
	folders: string[];
	tags: string[];
	/** The first property present gives the start, and the end; with no end, the event is one day. An end of `today`
	 * (or `ongoing`) keeps the event open until today. */
	startKeys: string[];
	endKeys: string[];
	titleKey: string;
	colorKey: string;
	defaultColor: string;
	/** The kinds of event, and the properties a note names its kind and its own icon with. */
	categories: Category[];
	categoryKey: string;
	iconKey: string;
	/** `yearly` (or `annually`, `every year`) draws the event every year from its first; with the calendar property
	 * `hijri`, every year of the Umm al-Qura calendar. */
	repeatKey: string;
	calendarKey: string;
	/** Days added to every day the Umm al-Qura calendar computes, -2 to 2: where the announced day differs from it. */
	hijriOffset: number;
	/** Dates a repeating event was observed on instead, each taking the place of that year's occurrence. */
	observedKey: string;
	/** Dates inside an event, such as a conference's deadline, each drawn as a day of its own in the kind below. */
	milestoneKeys: string[];
	milestoneCategory: string;
	/** Where a span planned on the grid is written as a note. */
	newFolder: string;
	/** Frontmatter lines added to a new event note, and the text after its frontmatter. Both may use {{title}},
	 * {{start}}, {{end}} and {{now:FORMAT}}. */
	extraProperties: string;
	body: string;
}

/** Each quarter on a tint of its own, as the Linear Calendar template does it. */
export interface QuarterOptions {
	enabled: boolean;
	/** The tints of the first to the fourth quarter. */
	colors: string[];
}

export type DayClick = 'menu' | 'note' | 'event';
export type EventClick = 'note' | 'edit' | 'menu';

export interface YearMapSettings {
	blockName: string;
	weekStart: Weekday;
	weekendDays: number[];
	title: string;
	tagline: string;
	density: 'comfortable' | 'compact';
	maxLanes: number;
	maxChips: number;
	/** What a click on a day does: ask (add an event, or open the day's note), open the note, or add an event. */
	dayClick: DayClick;
	/** What a click on an event does: open its note, open its window to edit it, or ask which. */
	eventClick: EventClick;
	/** A line under the title naming the kinds of event the year shows. */
	legend: boolean;
	quarters: QuarterOptions;
	days: DayOptions;
	tasks: TaskOptions;
	events: EventOptions;
}

/** The kinds a new vault starts with: the template drawing's four (Personal, Education, Work, Deadline), then six more. */
export const DEFAULT_CATEGORIES: Category[] = [
	{ name: 'Personal', color: '#f08c00', icon: '🌟' },
	{ name: 'Education', color: '#1971c2', icon: '📚' },
	{ name: 'Work', color: '#2f9e44', icon: '💼' },
	{ name: 'Deadline', color: '#e03131', icon: '⏰' },
	{ name: 'Conference', color: '#7048e8', icon: '🎤' },
	{ name: 'Holiday', color: '#099268', icon: '🌙' },
	{ name: 'Birthday', color: '#d6336c', icon: '🎂' },
	{ name: 'Trip', color: '#1098ad', icon: '✈️' },
	{ name: 'Money', color: '#5c940d', icon: '💰' },
	{ name: 'Sale', color: '#ae3ec9', icon: '🛍️' },
];

/** The Linear Calendar template's quarters: lavender, cream, aqua and rose. */
export const DEFAULT_QUARTER_COLORS = ['#fcf7ff', '#fffef6', '#ebffff', '#fef3f7'];

export const DEFAULT_SETTINGS: YearMapSettings = {
	blockName: 'year-map',
	weekStart: 0,
	weekendDays: [0, 6],
	title: '{year}',
	tagline: '',
	density: 'comfortable',
	maxLanes: 3,
	maxChips: 3,
	dayClick: 'menu',
	eventClick: 'note',
	legend: true,
	quarters: { enabled: true, colors: [...DEFAULT_QUARTER_COLORS] },
	days: {
		enabled: true,
		source: 'auto',
		journal: 'Daily',
		monthJournal: 'Monthly',
		yearJournal: 'Annually',
		folder: '',
		format: 'YYYY-MM-DD',
	},
	tasks: {
		enabled: true,
		dateField: 'scheduled-or-due',
		hideCompleted: false,
		dragReschedule: true,
		colorBy: 'status',
		tag: 'task',
		titleKey: 'title',
		dueKey: 'due',
		scheduledKey: 'scheduled',
		statusKey: 'status',
		priorityKey: 'priority',
		archiveTag: 'archived',
		completed: ['done'],
	},
	events: {
		enabled: true,
		folders: ['Year Map'],
		tags: ['event'],
		startKeys: ['start', 'date', 'startDate'],
		endKeys: ['end', 'endDate'],
		titleKey: 'title',
		colorKey: 'color',
		defaultColor: '#e8590c',
		categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
		categoryKey: 'category',
		iconKey: 'icon',
		repeatKey: 'repeat',
		calendarKey: 'calendar',
		hijriOffset: 0,
		observedKey: 'observed',
		milestoneKeys: ['deadline'],
		milestoneCategory: 'Deadline',
		newFolder: 'Year Map',
		extraProperties: '',
		body: '',
	},
};

/** The colours a task gets without TaskNotes, by status and by priority. */
export const DEFAULT_STATUS_COLORS: Record<string, string> = {
	'to-do': '#e8590c',
	open: '#e8590c',
	'in-progress': '#f59f00',
	done: '#2f9e44',
};
export const DEFAULT_PRIORITY_COLORS: Record<string, string> = {
	none: '#868e96',
	low: '#2f9e44',
	normal: '#f59f00',
	high: '#e03131',
};

/** Saved settings, as they may be: any part of them, from any version. */
export type SavedSettings = Partial<Omit<YearMapSettings, 'days' | 'tasks' | 'events' | 'quarters'>> & {
	days?: Partial<DayOptions>;
	tasks?: Partial<TaskOptions>;
	events?: Partial<EventOptions>;
	quarters?: Partial<QuarterOptions>;
};

/** Merge saved settings over the defaults, one level deep for the three layers and the quarters. */
export function mergeSettings(saved: SavedSettings | null | undefined): YearMapSettings {
	const d = structuredClone(DEFAULT_SETTINGS);
	const s = saved ?? {};
	const quarters = { ...d.quarters, ...(s.quarters ?? {}) };
	// four tints, whatever was saved
	quarters.colors = d.quarters.colors.map((c, i) => quarters.colors[i] ?? c);
	return {
		...d,
		...s,
		quarters,
		days: { ...d.days, ...(s.days ?? {}) },
		tasks: { ...d.tasks, ...(s.tasks ?? {}) },
		events: { ...d.events, ...(s.events ?? {}) },
	};
}

/** Kinds of event written one per line, `Name, #colour, icon` (a bar `|` may separate them too); a line without a
 * colour is not a kind. */
export function parseCategories(text: string): Category[] {
	const out: Category[] = [];
	for (const line of text.split(/\r?\n/)) {
		const parts = line.split(/\s*[,|]\s*/).map((p) => p.trim());
		const [name, color, icon] = parts;
		if (!name || !color || !/^#[0-9a-f]{3,8}$/i.test(color)) continue;
		out.push({ name, color, icon: icon ?? '' });
	}
	return out;
}

export function formatCategories(cats: readonly Category[]): string {
	return cats.map((c) => [c.name, c.color, c.icon].filter(Boolean).join(', ')).join('\n');
}
