/* Everything one year's map shows, from the notes and the settings. Pure: the renderer draws it, the tests read it. */
import { columnWeekdays, isoOf, yearGrid, type MonthRow, type Weekday } from './grid.ts';
import { layoutSpans, type Layout } from './layout.ts';
import { eventsFrom, safeColor, tasksFrom, type EventItem, type NoteFacts, type TaskItem, type TaskSettings } from './sources.ts';
import { DEFAULT_QUARTER_COLORS, type DayClick, type YearMapSettings } from './settings-model.ts';

/** A kind of event the year shows, for the legend. */
export interface LegendItem {
	name: string;
	color: string;
	icon: string;
}

export interface ModelInput {
	year: number;
	settings: YearMapSettings;
	notes: readonly NoteFacts[];
	taskSettings: TaskSettings;
	daily: Map<string, string>;
	today: string;
	monthNames: string[];
	weekdayNames: string[];
}

export interface YearModel {
	year: number;
	title: string;
	tagline: string;
	weekStart: Weekday;
	weekendDays: Set<number>;
	rows: MonthRow[];
	columns: Weekday[];
	monthNames: string[];
	weekdayNames: string[];
	today: string | null;
	layout: Layout<EventItem>;
	tasksByDay: Map<string, TaskItem[]>;
	daily: Map<string, string>;
	maxChips: number;
	density: 'comfortable' | 'compact';
	dragReschedule: boolean;
	show: { days: boolean; tasks: boolean; events: boolean };
	/** Every event that meets the year, drawn or counted, for a day's menu. */
	items: EventItem[];
	/** The kinds of event this year shows, in the settings' order; empty when the legend is off. */
	legend: LegendItem[];
	/** The tint of each quarter, or null when the quarters are not tinted. */
	quarterTints: string[] | null;
	dayClick: DayClick;
	/** A line saying what the map cannot draw here, such as Hijri repeats on a platform without Umm al-Qura; '' for none. */
	notice: string;
}

export const NO_HIJRI_NOTICE = 'This device has no Umm al-Qura calendar, so events that repeat on the Hijri calendar are drawn only on the days their notes give.';

export function buildModel(i: ModelInput): YearModel {
	const s = i.settings;
	const prefix = `${i.year}-`;
	const tasksByDay = new Map<string, TaskItem[]>();
	if (s.tasks.enabled) {
		for (const t of tasksFrom(i.notes, i.taskSettings, i.today)) {
			if (!t.iso.startsWith(prefix)) continue;
			const list = tasksByDay.get(t.iso) ?? [];
			list.push(t);
			tasksByDay.set(t.iso, list);
		}
		// what is still open first, the done last; otherwise the order the notes came in
		for (const list of tasksByDay.values()) list.sort((a, b) => Number(a.done) - Number(b.done));
	}
	const events = s.events.enabled ? eventsFrom(i.notes, s.events, { year: i.year, today: i.today }) : [];
	const first = isoOf(i.year, 0, 1);
	const last = isoOf(i.year, 11, 31);
	const items = events.filter((e) => e.end >= first && e.start <= last);
	const shown = new Set(items.filter((e) => e.category).map((e) => e.category));
	const legend = s.legend
		? s.events.categories.filter((c) => shown.has(c.name)).map((c) => ({ name: c.name, color: safeColor(c.color, s.events.defaultColor), icon: c.icon }))
		: [];
	const quarterTints = s.quarters.enabled
		? DEFAULT_QUARTER_COLORS.map((d, q) => safeColor(s.quarters.colors[q], d))
		: null;
	return {
		year: i.year,
		title: (s.title || '{year}').split('{year}').join(String(i.year)),
		tagline: s.tagline,
		weekStart: s.weekStart,
		weekendDays: new Set(s.weekendDays),
		rows: yearGrid(i.year, s.weekStart, s.weekendDays),
		columns: columnWeekdays(s.weekStart),
		monthNames: i.monthNames,
		weekdayNames: i.weekdayNames,
		today: i.today.startsWith(prefix) ? i.today : null,
		layout: layoutSpans(events, i.year, s.weekStart, Math.max(1, s.maxLanes)),
		tasksByDay,
		daily: s.days.enabled ? i.daily : new Map<string, string>(),
		maxChips: Math.max(1, s.maxChips),
		density: s.density,
		dragReschedule: s.tasks.dragReschedule,
		show: { days: s.days.enabled, tasks: s.tasks.enabled, events: s.events.enabled },
		items,
		legend,
		quarterTints,
		dayClick: s.dayClick,
		// any year: a Hijri event written last year is missing from this one
		notice: events.some((e) => e.noCalendar) ? NO_HIJRI_NOTICE : '',
	};
}

/** A span of days in words: `8 Apr – 11 Apr 2026`, or one day, or across the turn of a year. */
export function rangeLabel(start: string, end: string, monthNames: string[]): string {
	const part = (iso: string): string => `${Number(iso.slice(8, 10))} ${monthNames[Number(iso.slice(5, 7)) - 1] ?? ''}`;
	if (start === end) return `${part(start)} ${start.slice(0, 4)}`;
	if (start.slice(0, 4) === end.slice(0, 4)) return `${part(start)} – ${part(end)} ${end.slice(0, 4)}`;
	return `${part(start)} ${start.slice(0, 4)} – ${part(end)} ${end.slice(0, 4)}`;
}

/** Everything a model draws, as one string: when it is the same as last time, there is nothing to draw again. */
export function signatureOf(m: YearModel): string {
	return JSON.stringify([
		m.year, m.title, m.tagline, m.weekStart, [...m.weekendDays], m.today, m.maxChips, m.density, m.dragReschedule, m.show,
		m.monthNames, m.weekdayNames,
		[...m.tasksByDay.entries()].map(([iso, list]) => [iso, list.map((t) => [t.path, t.title, t.kind, t.color, t.done, t.overdue])]),
		m.layout.rows.map((row) => row.map((s) => [s.item.id, s.item.title, s.item.color, s.item.icon, s.item.category,
			s.startCol, s.endCol, s.lane, s.startsHere, s.endsHere])),
		[...m.layout.hidden.entries()],
		[...m.daily.keys()].sort(),
		m.legend, m.quarterTints, m.dayClick, m.notice,
	]);
}
