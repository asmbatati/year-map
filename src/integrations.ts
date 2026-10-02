/*
 * The plugins the year map works with, read through what each exposes at run time and never required:
 * - TaskNotes: its settings (task tag, field names, status and priority colours) and its own update call, so a moved
 *   task is rescheduled the way TaskNotes would do it;
 * - Journals: its journals for a day, a month and a year, opened (and created from their templates) by Journals itself;
 * - Daily notes (core) and Periodic Notes: their folder, date format and template;
 * - without any of them, a folder and a date format from the settings.
 * Events planned on the grid are written here, as notes with a start and an end.
 */
import { Notice, TFile, moment, normalizePath, type App, type PaneType } from 'obsidian';
import { dailyNotes, journalDays, moveDate, taskSettingsFrom, type NoteFacts } from './sources.ts';
import type { EventDraft } from './modal.ts';
import type { YearMapSettings } from './settings-model.ts';

type OpenMode = PaneType | boolean;

interface Journal {
	get(date: string): unknown;
	open(note: unknown, mode?: OpenMode): Promise<void>;
}

interface TaskNotesApi {
	settings?: unknown;
	cacheManager?: { getTaskInfo?: (path: string) => unknown };
	updateTaskProperty?: (task: unknown, property: string, value: string) => Promise<unknown>;
}

/** Where a kind of dated note lives, by folder, date format and template. */
export interface DatedNotes {
	folder: string;
	format: string;
	template: string;
}

export type DaySource = 'journals' | 'daily-notes' | 'custom';

const isJournal = (j: unknown): j is Journal =>
	typeof j === 'object' && j !== null && typeof (j as Journal).get === 'function' && typeof (j as Journal).open === 'function';

/** A title as a file name: no characters a file or a link cannot carry, spaces collapsed, not too long. */
export function safeFileName(title: string): string {
	return title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100).trim();
}

export class Integrations {
	private app: App;
	private settings: () => YearMapSettings;

	constructor(app: App, settings: () => YearMapSettings) {
		this.app = app;
		this.settings = settings;
	}

	/** Another plugin's instance, when it is installed and enabled. */
	private plugin(id: string): unknown {
		const registry = (this.app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins;
		return registry?.plugins?.[id] ?? null;
	}

	private tasknotes(): TaskNotesApi | null {
		return this.plugin('tasknotes') as TaskNotesApi | null;
	}

	/** TaskNotes' settings, read anew each time, so a change there shows at once. */
	tasknotesSettings(): unknown {
		return this.tasknotes()?.settings;
	}

	private journal(name: string): Journal | null {
		if (!name) return null;
		const journals = this.plugin('journals') as { getJournal?: (n: string) => unknown } | null;
		const j = journals?.getJournal?.(name);
		return isJournal(j) ? j : null;
	}

	/** Core Daily notes when it is on, or Periodic Notes' daily notes when they are. */
	private coreDaily(): DatedNotes | null {
		const periodic = this.periodic('daily');
		if (periodic) return periodic;
		const internal = (this.app as unknown as { internalPlugins?: { getPluginById?: (id: string) => unknown } }).internalPlugins;
		const p = internal?.getPluginById?.('daily-notes') as
			| { enabled?: boolean; instance?: { options?: { folder?: string; format?: string; template?: string } } }
			| null
			| undefined;
		if (!p?.enabled) return null;
		const o = p.instance?.options ?? {};
		return { folder: o.folder ?? '', format: o.format || 'YYYY-MM-DD', template: o.template ?? '' };
	}

	private periodic(kind: 'daily' | 'monthly' | 'yearly'): DatedNotes | null {
		const pn = this.plugin('periodic-notes') as { settings?: Record<string, unknown> } | null;
		const s = pn?.settings?.[kind] as { enabled?: boolean; folder?: string; format?: string; template?: string } | undefined;
		if (!s?.enabled) return null;
		const fallback = { daily: 'YYYY-MM-DD', monthly: 'YYYY-MM', yearly: 'YYYY' }[kind];
		return { folder: s.folder ?? '', format: s.format || fallback, template: s.template ?? '' };
	}

	/** Who keeps the daily notes: the settings' choice, or the first of Journals, Daily notes and Periodic Notes. */
	daySource(): DaySource | null {
		const d = this.settings().days;
		if (d.source !== 'auto') return d.source;
		if (this.journal(d.journal)) return 'journals';
		if (this.coreDaily()) return 'daily-notes';
		return null;
	}

	private customDaily(): DatedNotes {
		const d = this.settings().days;
		return { folder: d.folder, format: d.format || 'YYYY-MM-DD', template: '' };
	}

	/** Each day that has a daily note, and that note. */
	dailyIndex(notes: readonly NoteFacts[]): Map<string, string> {
		const source = this.daySource();
		if (source === 'journals') return journalDays(notes, this.settings().days.journal);
		const where = source === 'daily-notes' ? this.coreDaily() : source === 'custom' ? this.customDaily() : null;
		if (!where) return new Map();
		const folder = normalizeFolder(where.folder);
		const parse = (name: string): string | null => {
			const m = moment(name, where.format, true);
			return m.isValid() ? m.format('YYYY-MM-DD') : null;
		};
		// a format with a slash names folders too: the date is read from the path under the folder
		const files = where.format.includes('/')
			? notes.map((n) => ({ path: n.path, name: (folder ? n.path.slice(folder.length + 1) : n.path).replace(/\.md$/, '') }))
			: notes;
		return dailyNotes(files, folder, parse);
	}

	async openDay(iso: string, mode: OpenMode): Promise<void> {
		const source = this.daySource();
		if (source === 'journals' && (await this.openJournal(this.settings().days.journal, iso, mode))) return;
		const where = source === 'daily-notes' ? this.coreDaily() : source === 'custom' ? this.customDaily() : null;
		if (where) {
			await this.openDated(where, iso, mode);
			return;
		}
		new Notice("No daily notes to open: choose where they are kept in the year map's settings.");
	}

	/** A month's or a year's note: from its journal, else from Periodic Notes. */
	async openPeriod(kind: 'month' | 'year', iso: string, mode: OpenMode): Promise<void> {
		const d = this.settings().days;
		if (await this.openJournal(kind === 'month' ? d.monthJournal : d.yearJournal, iso, mode)) return;
		const where = this.periodic(kind === 'month' ? 'monthly' : 'yearly');
		if (where) {
			await this.openDated(where, iso, mode);
			return;
		}
		new Notice(`No ${kind === 'month' ? 'monthly' : 'yearly'} notes to open: name their journal in the year map's settings.`);
	}

	private async openJournal(name: string, iso: string, mode: OpenMode): Promise<boolean> {
		const journal = this.journal(name);
		if (!journal) return false;
		const note = journal.get(iso);
		if (!note) return false;
		await journal.open(note, mode);
		return true;
	}

	private async openDated(where: DatedNotes, iso: string, mode: OpenMode): Promise<void> {
		const name = moment(iso, 'YYYY-MM-DD', true).format(where.format);
		const folder = normalizeFolder(where.folder);
		const path = normalizePath(folder ? `${folder}/${name}.md` : `${name}.md`);
		if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
			const text = await this.templateText(where.template, iso, name.split('/').pop() ?? name);
			await this.ensureFolder(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
			await this.app.vault.create(path, text);
		}
		await this.app.workspace.openLinkText(path, '', mode);
	}

	/** A template's text with the core plugins' placeholders filled in: {{date}}, {{date:FORMAT}}, {{time}}, {{title}}. */
	private async templateText(template: string, iso: string, title: string): Promise<string> {
		if (!template) return '';
		const path = normalizePath(template.endsWith('.md') ? template : `${template}.md`);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return '';
		const text = await this.app.vault.read(file);
		return text.replace(/{{\s*(date|time|title)\s*(?::([^}]*))?}}/gi, (_m, kind: string, format?: string) => {
			const k = kind.toLowerCase();
			if (k === 'title') return title;
			if (k === 'time') return moment().format(format?.trim() || 'HH:mm');
			return moment(iso).format(format?.trim() || 'YYYY-MM-DD');
		});
	}

	private async ensureFolder(folder: string): Promise<void> {
		if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
	}

	/** Move a task to another day: through TaskNotes when it is there, else in the note's own frontmatter. The time of
	 * day the date had is kept. */
	async reschedule(path: string, kind: 'due' | 'scheduled', iso: string): Promise<void> {
		const tn = this.tasknotes();
		if (tn?.cacheManager?.getTaskInfo && tn.updateTaskProperty) {
			const info = (await tn.cacheManager.getTaskInfo(path)) as Record<string, unknown> | null;
			if (info) {
				await tn.updateTaskProperty(info, kind, moveDate(info[kind], iso));
				return;
			}
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const ts = taskSettingsFrom(tn?.settings, this.settings());
		const key = kind === 'due' ? ts.dueKey : ts.scheduledKey;
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm[key] = moveDate(fm[key], iso);
		});
	}

	/** Write a planned event as a note in the folder for new events, under a name no other note has. Its kind, icon,
	 * colour and repeat are written only when they were given. */
	async createEvent(d: EventDraft): Promise<string> {
		const e = this.settings().events;
		const { title, start, end } = d;
		const folder = normalizeFolder(e.newFolder || e.folders[0] || '');
		const base = safeFileName(title) || 'Event';
		const at = (name: string): string => normalizePath(folder ? `${folder}/${name}.md` : `${name}.md`);
		let path = at(base);
		for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = at(`${base} ${n}`);
		await this.ensureFolder(folder);
		const lines = ['---', `${e.titleKey || 'title'}: ${JSON.stringify(title)}`, `${e.startKeys[0] || 'start'}: ${start}`];
		if (end !== start) lines.push(`${e.endKeys[0] || 'end'}: ${end}`);
		if (d.category) lines.push(`${e.categoryKey || 'category'}: ${JSON.stringify(d.category)}`);
		if (d.icon) lines.push(`${e.iconKey || 'icon'}: ${JSON.stringify(d.icon)}`);
		if (d.color) lines.push(`${e.colorKey || 'color'}: ${JSON.stringify(d.color)}`);
		if (d.repeat === 'yearly' || d.repeat === 'hijri') lines.push(`${e.repeatKey || 'repeat'}: yearly`);
		if (d.repeat === 'hijri') lines.push(`${e.calendarKey || 'calendar'}: hijri`);
		const inFolder = e.folders.some((f) => {
			const g = normalizeFolder(f);
			return g !== '' && path.startsWith(g + '/');
		});
		if (!inFolder && e.tags[0]) lines.push('tags:', `  - ${e.tags[0]}`);
		const fill = (text: string): string => fillPlaceholders(text, { title, start, end });
		const extra = fill(e.extraProperties).replace(/\r\n/g, '\n').trim();
		if (extra) lines.push(...extra.split('\n'));
		lines.push('---', '');
		const body = fill(e.body).replace(/\r\n/g, '\n');
		await this.app.vault.create(path, lines.join('\n') + body + (body && !body.endsWith('\n') ? '\n' : ''));
		return path;
	}
}

/** A new note's text with its placeholders filled in: {{title}}, {{start}}, {{end}}, and {{now:FORMAT}} for the
 * moment it was written (moment.js tokens). */
export function fillPlaceholders(text: string, values: { title: string; start: string; end: string }): string {
	return text.replace(/{{\s*(title|start|end|now)\s*(?::([^}]*))?}}/gi, (_m, name: string, format?: string) => {
		const k = name.toLowerCase();
		if (k === 'now') return moment().format(format?.trim() || 'YYYY-MM-DD HH:mm');
		return values[k as 'title' | 'start' | 'end'];
	});
}

/** A folder from the settings, as a vault path: no slashes at either end, and the vault's root as ''. */
export function normalizeFolder(folder: string): string {
	const f = folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	return f ? normalizePath(f) : '';
}
