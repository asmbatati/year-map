/*
 * What the year map reads from notes. Tasks come through TaskNotes' own settings (its task tag or property, its field
 * names, its status and priority colours), so a vault that renamed `due` or `status` still works; without TaskNotes
 * the plugin's own defaults stand in. Events are notes with a start and an end in the folders or tags the settings
 * name (Full Calendar's event notes read the same way). Daily notes are matched by date. Pure.
 */
import {
	DEFAULT_PRIORITY_COLORS,
	DEFAULT_STATUS_COLORS,
	type EventOptions,
	type TaskDateField,
	type YearMapSettings,
} from './settings-model.ts';
import type { Span } from './layout.ts';
import { hijriAvailable, isHijri, isYearly, occurrencesIn } from './recur.ts';

export interface NoteFacts {
	path: string;
	name: string;
	fm: Record<string, unknown> | undefined;
	tags: string[];
}

const ISO = /^(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** A frontmatter value as an ISO date, or null: `2026-10-03`, with a time after it, a Date, a link to a dated note,
 * or a one-item list of one of these. Anything else is not guessed at. */
export function dateOf(v: unknown): string | null {
	if (Array.isArray(v)) return v.length ? dateOf(v[0]) : null;
	if (v instanceof Date) {
		if (Number.isNaN(v.getTime())) return null;
		return v.toISOString().slice(0, 10);
	}
	if (typeof v !== 'string') return null;
	const s = v.trim().replace(/^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/, '$1').trim();
	const m = ISO.exec(s);
	return m?.[1] ?? null;
}

const stringOf = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const plainTag = (t: string): string => t.replace(/^#/, '').toLowerCase();

/** A colour safe to hand to CSS: a hex code or a colour's name, nothing that could load or break out. */
export function safeColor(v: unknown, fallback: string): string {
	const s = stringOf(v).trim();
	return /^#[0-9a-f]{3,8}$/i.test(s) || /^[a-z]{3,20}$/i.test(s) ? s : fallback;
}

export interface TaskSettings {
	method: 'tag' | 'property';
	tag: string;
	property: string;
	propertyValue: string;
	titleKey: string;
	dueKey: string;
	scheduledKey: string;
	statusKey: string;
	priorityKey: string;
	archiveTag: string;
	completed: string[];
	statusColors: Record<string, string>;
	priorityColors: Record<string, string>;
	dateField: TaskDateField;
	hideCompleted: boolean;
	colorBy: 'status' | 'priority';
}

interface TaskNotesLike {
	taskTag?: unknown;
	taskIdentificationMethod?: unknown;
	taskPropertyName?: unknown;
	taskPropertyValue?: unknown;
	fieldMapping?: Record<string, unknown>;
	customStatuses?: { value?: unknown; color?: unknown; isCompleted?: unknown }[];
	customPriorities?: { value?: unknown; color?: unknown }[];
}

/** The task settings from TaskNotes' own (`plugin.settings` when it is loaded), over the year map's fallbacks. */
export function taskSettingsFrom(tasknotes: unknown, s: YearMapSettings): TaskSettings {
	const tn = (tasknotes && typeof tasknotes === 'object' ? tasknotes : {}) as TaskNotesLike;
	const f = tn.fieldMapping ?? {};
	const key = (name: string, fallback: string): string => stringOf(f[name]) || fallback;
	const statuses = Array.isArray(tn.customStatuses) ? tn.customStatuses : [];
	const priorities = Array.isArray(tn.customPriorities) ? tn.customPriorities : [];
	const statusColors: Record<string, string> = statuses.length ? {} : { ...DEFAULT_STATUS_COLORS };
	for (const st of statuses) statusColors[stringOf(st.value)] = safeColor(st.color, '#868e96');
	const priorityColors: Record<string, string> = priorities.length ? {} : { ...DEFAULT_PRIORITY_COLORS };
	for (const p of priorities) priorityColors[stringOf(p.value)] = safeColor(p.color, '#868e96');
	const completed = statuses.length
		? statuses.filter((st) => st.isCompleted === true).map((st) => stringOf(st.value))
		: [...s.tasks.completed];
	return {
		method: tn.taskIdentificationMethod === 'property' ? 'property' : 'tag',
		tag: plainTag(stringOf(tn.taskTag) || s.tasks.tag),
		property: stringOf(tn.taskPropertyName),
		propertyValue: stringOf(tn.taskPropertyValue),
		titleKey: key('title', s.tasks.titleKey),
		dueKey: key('due', s.tasks.dueKey),
		scheduledKey: key('scheduled', s.tasks.scheduledKey),
		statusKey: key('status', s.tasks.statusKey),
		priorityKey: key('priority', s.tasks.priorityKey),
		archiveTag: plainTag(key('archiveTag', s.tasks.archiveTag)),
		completed,
		statusColors,
		priorityColors,
		dateField: s.tasks.dateField,
		hideCompleted: s.tasks.hideCompleted,
		colorBy: s.tasks.colorBy,
	};
}

export interface TaskItem {
	path: string;
	title: string;
	iso: string;
	kind: 'due' | 'scheduled';
	status: string;
	priority: string;
	done: boolean;
	overdue: boolean;
	color: string;
}

function isTask(n: NoteFacts, ts: TaskSettings): boolean {
	if (ts.method === 'property') {
		const v = n.fm?.[ts.property];
		return Array.isArray(v) ? v.map(stringOf).includes(ts.propertyValue) : stringOf(v) === ts.propertyValue;
	}
	return n.tags.some((t) => {
		const p = plainTag(t);
		return p === ts.tag || p.startsWith(ts.tag + '/');
	});
}

export function tasksFrom(notes: readonly NoteFacts[], ts: TaskSettings, today: string): TaskItem[] {
	const out: TaskItem[] = [];
	for (const n of notes) {
		if (!isTask(n, ts)) continue;
		if (ts.archiveTag && n.tags.some((t) => plainTag(t) === ts.archiveTag)) continue;
		const fm = n.fm ?? {};
		const status = stringOf(fm[ts.statusKey]);
		const done = ts.completed.includes(status);
		if (done && ts.hideCompleted) continue;
		const priority = stringOf(fm[ts.priorityKey]);
		const due = dateOf(fm[ts.dueKey]);
		const scheduled = dateOf(fm[ts.scheduledKey]);
		const places: { iso: string; kind: 'due' | 'scheduled' }[] = [];
		if (ts.dateField === 'due' && due) places.push({ iso: due, kind: 'due' });
		if (ts.dateField === 'scheduled' && scheduled) places.push({ iso: scheduled, kind: 'scheduled' });
		if (ts.dateField === 'scheduled-or-due') {
			if (scheduled) places.push({ iso: scheduled, kind: 'scheduled' });
			else if (due) places.push({ iso: due, kind: 'due' });
		}
		if (ts.dateField === 'both') {
			if (scheduled) places.push({ iso: scheduled, kind: 'scheduled' });
			if (due && due !== scheduled) places.push({ iso: due, kind: 'due' });
		}
		const title = stringOf(fm[ts.titleKey]) || n.name;
		const color = ts.colorBy === 'priority'
			? (ts.priorityColors[priority] ?? '#868e96')
			: (ts.statusColors[status] ?? '#868e96');
		for (const p of places) {
			out.push({ path: n.path, title, iso: p.iso, kind: p.kind, status, priority, done,
				overdue: !done && p.kind === 'due' && p.iso < today, color });
		}
	}
	return out;
}

export interface EventItem extends Span {
	path: string;
	title: string;
	color: string;
	/** An emoji or a few letters drawn before the title; '' for none. */
	icon: string;
	/** The kind's name as the settings spell it; '' for none. */
	category: string;
	/** For a date inside an event (a deadline), the property it came from. */
	milestone?: string;
	/** An event that repeats on a calendar the platform does not have, drawn on its note's own days only. */
	noCalendar?: boolean;
}

/** What the year is drawn for: repeats are worked out for this year, and an open end runs until today. */
export interface EventContext {
	year?: number;
	today?: string;
}

function under(path: string, folder: string): boolean {
	const f = folder.replace(/^\/+|\/+$/g, '');
	return f !== '' && (path === f || path.startsWith(f + '/'));
}

const OPEN_END = new Set(['today', 'ongoing', 'open', 'now']);

/** An icon from a note: an emoji or a short word, at most eight characters of it. */
function iconOf(v: unknown): string {
	return Array.from(stringOf(v).trim()).slice(0, 8).join('');
}

export function eventsFrom(notes: readonly NoteFacts[], es: EventOptions, ctx: EventContext = {}): EventItem[] {
	const tags = new Set(es.tags.map(plainTag));
	const kinds = new Map(es.categories.map((c) => [c.name.trim().toLowerCase(), c]));
	const mark = kinds.get(es.milestoneCategory.trim().toLowerCase());
	const out: EventItem[] = [];
	for (const n of notes) {
		const inFolder = es.folders.some((f) => under(n.path, f));
		const tagged = n.tags.some((t) => tags.has(plainTag(t)));
		if (!inFolder && !tagged) continue;
		const fm = n.fm ?? {};
		const first = (keys: string[]): string | null => {
			for (const k of keys) {
				const d = dateOf(fm[k]);
				if (d) return d;
			}
			return null;
		};
		const title = stringOf(fm[es.titleKey]) || n.name;
		const kind = kinds.get(stringOf(fm[es.categoryKey]).trim().toLowerCase());
		const base = {
			path: n.path,
			title,
			color: safeColor(fm[es.colorKey], kind?.color ?? es.defaultColor),
			icon: iconOf(fm[es.iconKey]) || kind?.icon || '',
			category: kind?.name ?? '',
		};
		const start = first(es.startKeys);
		if (start) {
			let end = first(es.endKeys) ?? start;
			const open = es.endKeys.some((k) => OPEN_END.has(stringOf(fm[k]).trim().toLowerCase()));
			if (open && ctx.today) end = ctx.today > start ? ctx.today : start;
			if (end < start) end = start;
			const repeats = isYearly(fm[es.repeatKey]) && ctx.year !== undefined;
			const hijri = isHijri(fm[es.calendarKey]);
			if (!repeats) {
				out.push({ ...base, id: n.path, start, end });
			} else if (hijri && !hijriAvailable()) {
				out.push({ ...base, id: n.path, start, end, noCalendar: true });
			} else {
				const year = ctx.year ?? Number(start.slice(0, 4));
				const observed = [fm[es.observedKey]].flat().map(dateOf).filter((d): d is string => d !== null);
				const occurrences = occurrencesIn(start, end, year, { hijri, offset: es.hijriOffset, observed });
				for (const o of occurrences) out.push({ ...base, id: `${n.path}@${o.start}`, start: o.start, end: o.end });
			}
		}
		for (const key of es.milestoneKeys) {
			const d = dateOf(fm[key]);
			if (!d) continue;
			out.push({
				id: `${n.path}#${key}`, path: n.path, start: d, end: d, title: `${title} · ${key}`,
				color: mark?.color ?? '#e03131', icon: mark?.icon ?? '', category: mark?.name ?? '', milestone: key,
			});
		}
	}
	return out;
}

/** An event note as its window shows it, read from the note itself, not from a year's occurrence of it: the first
 * start and end it has, its kind (as the settings spell it when it is one), icon, colour and repeat. */
export interface StoredEvent {
	title: string;
	start: string;
	end: string;
	category?: string;
	icon?: string;
	color?: string;
	repeat: 'never' | 'yearly' | 'hijri';
	/** The keys the dates were found under, to write them back where they were. */
	startKey?: string;
	endKey?: string;
}

export function storedEvent(fm: Record<string, unknown> | undefined, name: string, es: EventOptions): StoredEvent {
	const f = fm ?? {};
	const found = (keys: string[]): { key: string; iso: string } | null => {
		for (const k of keys) {
			const iso = dateOf(f[k]);
			if (iso) return { key: k, iso };
		}
		return null;
	};
	const s = found(es.startKeys);
	const e = found(es.endKeys);
	const raw = stringOf(f[es.categoryKey]).trim();
	const kind = es.categories.find((c) => c.name.trim().toLowerCase() === raw.toLowerCase());
	const color = stringOf(f[es.colorKey]).trim();
	const out: StoredEvent = {
		title: stringOf(f[es.titleKey]) || name,
		start: s?.iso ?? '',
		end: e?.iso ?? s?.iso ?? '',
		repeat: isYearly(f[es.repeatKey]) ? (isHijri(f[es.calendarKey]) ? 'hijri' : 'yearly') : 'never',
	};
	if (raw) out.category = kind?.name ?? raw;
	const icon = iconOf(f[es.iconKey]);
	if (icon) out.icon = icon;
	if (color && safeColor(color, '') === color) out.color = color;
	if (s) out.startKey = s.key;
	if (e) out.endKey = e.key;
	return out;
}

/** A date moved to another day: the new day, with the old value's time of day kept when it had one. */
export function moveDate(old: unknown, iso: string): string {
	const m = typeof old === 'string' ? /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)$/.exec(old.trim()) : null;
	return iso + (m?.[1] ?? '');
}

/** A note's tags from its frontmatter (`tags`, or `tag`): a list, or a string of them; lower case, without `#`. */
export function tagsOf(fm: Record<string, unknown> | undefined): string[] {
	const v = fm?.tags ?? fm?.tag;
	const items = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : [];
	return items.filter((t): t is string => typeof t === 'string').map(plainTag).filter(Boolean);
}

/** The days a Journals journal has written: Journals records a note's journal and date in its frontmatter
 * (`journal`, `journal-date`), whatever the note's name looks like. */
export function journalDays(notes: readonly NoteFacts[], journal: string): Map<string, string> {
	const name = journal.toLowerCase();
	const out = new Map<string, string>();
	for (const n of notes) {
		if (stringOf(n.fm?.journal).toLowerCase() !== name) continue;
		const iso = dateOf(n.fm?.['journal-date']);
		if (iso && !out.has(iso)) out.set(iso, n.path);
	}
	return out;
}

/** The daily notes: the notes under `folder` (the whole vault when it is empty) whose names parse as a date. */
export function dailyNotes(files: readonly { path: string; name: string }[], folder: string,
	parse: (name: string) => string | null): Map<string, string> {
	const f = folder.replace(/^\/+|\/+$/g, '');
	const out = new Map<string, string>();
	for (const file of files) {
		if (f && !under(file.path, f)) continue;
		const iso = parse(file.name);
		if (iso && !out.has(iso)) out.set(iso, file.path);
	}
	return out;
}
