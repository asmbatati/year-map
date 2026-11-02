/*
 * Draws a year's model with Obsidian's DOM helpers (`createDiv`, `createEl`, `setCssProps`): the title box and the
 * line under it, the weekdays above and below, a row per month named on both sides, 37 cells to a row with the
 * weekend columns shaded, the tasks on their days and the events as bars over the days. Every gesture is handed back
 * through `Handlers`; nothing here touches a note.
 */
import { rangeLabel, type YearModel } from './model.ts';
import type { TaskItem } from './sources.ts';

export interface Handlers {
	openDay(iso: string, evt?: MouseEvent): void;
	/** A click on a day: the plugin asks (add an event, or open the day's note), opens the note, or adds an event. */
	clickDay(iso: string, evt?: MouseEvent): void;
	/** A right-click on a day: always the menu. */
	dayMenu(iso: string, evt?: MouseEvent): void;
	openMonth(month: number, evt?: MouseEvent): void;
	openYear(evt?: MouseEvent): void;
	openNote(path: string, evt?: MouseEvent): void;
	/** A click on an event: its note, its edit, or a menu of both, as the settings say. */
	clickEvent(path: string, evt?: MouseEvent | KeyboardEvent): void;
	eventMenu(path: string, evt?: MouseEvent): void;
	planRange(start: string, end: string): void;
	reschedule(path: string, fromIso: string, kind: 'due' | 'scheduled', toIso: string): void;
	prevYear(): void;
	nextYear(): void;
	thisYear(): void;
	hover?: (path: string, target: HTMLElement, evt: MouseEvent) => void;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

function weekdayRow(parent: HTMLElement, m: YearModel, where: 'top' | 'bottom'): void {
	const row = parent.createDiv({ cls: ['ym-weekdays', `ym-weekdays-${where}`] });
	row.createDiv({ cls: 'ym-corner' });
	m.columns.forEach((wd) => {
		const cell = row.createDiv({ cls: 'ym-wd', text: m.weekdayNames[wd] ?? '' });
		if (m.weekendDays.has(wd)) cell.addClass('is-weekend');
	});
	row.createDiv({ cls: 'ym-corner' });
}

function chip(parent: HTMLElement, t: TaskItem, m: YearModel, h: Handlers, drag: DragState): void {
	const cls = ['ym-task', `is-${t.kind}`];
	if (t.done) cls.push('is-done');
	if (t.overdue) cls.push('is-overdue');
	const el = parent.createDiv({ cls, attr: { 'data-path': t.path, 'aria-label': `${t.title} · ${t.kind}`, role: 'button', tabindex: '0' } });
	el.setCssProps({ '--ym-color': t.color });
	el.createSpan({ cls: 'ym-task-dot' });
	el.createSpan({ cls: 'ym-task-title', text: t.title });
	el.addEventListener('click', (evt) => {
		evt.stopPropagation();
		h.openNote(t.path, evt);
	});
	// a press on a task is the start of moving it, not of planning the days under it
	el.addEventListener('pointerdown', (evt) => evt.stopPropagation());
	el.addEventListener('keydown', (evt) => {
		if (evt.key === 'Enter') h.openNote(t.path);
	});
	if (h.hover) {
		const hover = h.hover;
		el.addEventListener('mouseover', (evt) => hover(t.path, el, evt));
	}
	el.draggable = m.dragReschedule;
	if (m.dragReschedule) {
		el.addEventListener('dragstart', (evt) => {
			drag.task = { path: t.path, iso: t.iso, kind: t.kind };
			evt.dataTransfer?.setData('text/plain', t.title);
			if (evt.dataTransfer) evt.dataTransfer.effectAllowed = 'move';
		});
		el.addEventListener('dragend', () => {
			drag.task = null;
		});
	}
}

interface DragState {
	task: { path: string; iso: string; kind: 'due' | 'scheduled' } | null;
	from: string | null;
	to: string | null;
	moved: boolean;
	suppressClick: boolean;
}

export function renderYear(container: HTMLElement, m: YearModel, h: Handlers): void {
	container.empty();
	const root = container.createDiv({ cls: ['ym', `ym-${m.density}`] });
	const drag: DragState = { task: null, from: null, to: null, moved: false, suppressClick: false };

	const head = root.createDiv({ cls: 'ym-head' });
	const box = head.createDiv({ cls: 'ym-title-box' });
	const title = box.createEl('h2', { cls: 'ym-title', text: m.title, attr: { role: 'button', tabindex: '0' } });
	title.addEventListener('click', (evt) => h.openYear(evt));
	const nav = head.createDiv({ cls: 'ym-nav' });
	const prev = nav.createEl('button', { cls: 'ym-prev', text: '‹', attr: { 'aria-label': 'Previous year' } });
	const today = nav.createEl('button', { cls: 'ym-today', text: 'Today' });
	const next = nav.createEl('button', { cls: 'ym-next', text: '›', attr: { 'aria-label': 'Next year' } });
	prev.addEventListener('click', () => h.prevYear());
	today.addEventListener('click', () => h.thisYear());
	next.addEventListener('click', () => h.nextYear());
	if (m.tagline) head.createDiv({ cls: 'ym-tagline', text: m.tagline });
	if (m.notice) root.createDiv({ cls: 'ym-notice', text: m.notice, attr: { role: 'status' } });
	if (m.legend.length) {
		const legend = root.createDiv({ cls: 'ym-legend' });
		for (const k of m.legend) {
			legend.createDiv({ cls: 'ym-legend-item', text: k.icon ? `${k.icon} ${k.name}` : k.name }).setCssProps({ '--ym-color': k.color });
		}
	}

	const grid = root.createDiv({ cls: 'ym-grid', attr: { role: 'grid', 'aria-label': m.title } });
	weekdayRow(grid, m, 'top');

	const dated: { iso: string; el: HTMLElement }[] = [];
	const paint = (): void => {
		const a = drag.from && drag.to ? (drag.from < drag.to ? drag.from : drag.to) : null;
		const b = drag.from && drag.to ? (drag.from < drag.to ? drag.to : drag.from) : null;
		for (const d of dated) d.el.toggleClass('is-selecting', a !== null && b !== null && d.iso >= a && d.iso <= b);
	};
	const cancelSelection = (): void => {
		if (!drag.from) return;
		drag.from = null;
		drag.to = null;
		drag.moved = false;
		paint();
	};
	const endSelection = (): void => {
		if (drag.from && drag.to && drag.moved) {
			const a = drag.from < drag.to ? drag.from : drag.to;
			const b = drag.from < drag.to ? drag.to : drag.from;
			drag.suppressClick = true;
			h.planRange(a, b);
		}
		drag.from = null;
		drag.to = null;
		drag.moved = false;
		paint();
	};

	m.rows.forEach((row) => {
		const quarter = Math.floor(row.month / 3);
		const month = grid.createDiv({ cls: ['ym-month', `ym-q${quarter + 1}`], attr: { 'data-month': String(row.month), role: 'row' } });
		const tint = m.quarterTints?.[quarter];
		if (tint) {
			month.addClass('has-tint');
			month.setCssProps({ '--ym-qtint': tint });
		}
		const label = (side: string): void => {
			const l = month.createDiv({ cls: ['ym-mlabel', `ym-mlabel-${side}`], text: m.monthNames[row.month] ?? '',
				attr: { role: 'button', tabindex: side === 'left' ? '0' : '-1' } });
			l.addEventListener('click', (evt) => h.openMonth(row.month, evt));
		};
		label('left');
		const days = month.createDiv({ cls: 'ym-days' });
		const segs = m.show.events ? (m.layout.rows[row.month] ?? []) : [];
		const lanes = segs.reduce((n, s) => Math.max(n, s.lane + 1), 0);
		// at least one lane, so every month keeps room for a bar and the rows stay even
		days.setCssProps({ '--ym-lanes': String(Math.max(1, lanes)) });
		const byCol = new Map(row.days.map((d) => [d.col, d]));
		for (let col = 0; col < m.columns.length; col++) {
			const d = byCol.get(col);
			const wd = m.columns[col] ?? 0;
			const cls = ['ym-cell'];
			if (m.weekendDays.has(wd)) cls.push('is-weekend');
			if (!d) {
				days.createDiv({ cls: [...cls, 'is-empty'] }).setCssProps({ '--ym-col': String(col + 1) });
				continue;
			}
			if (d.iso === m.today) cls.push('is-today');
			if (m.daily.has(d.iso)) cls.push('has-note');
			const cell = days.createDiv({ cls, attr: { 'data-iso': d.iso, role: 'gridcell' } });
			cell.setCssProps({ '--ym-col': String(col + 1) });
			cell.createSpan({ cls: 'ym-num', text: pad2(d.day) });
			dated.push({ iso: d.iso, el: cell });
			const hiddenCount = m.layout.hidden.get(d.iso);
			if (m.show.events && hiddenCount) {
				cell.createSpan({ cls: 'ym-hidden', text: `+${hiddenCount}`, attr: { 'aria-label': `${hiddenCount} more` } });
			}
			const tasks = m.tasksByDay.get(d.iso) ?? [];
			if (tasks.length) {
				const box2 = cell.createDiv({ cls: 'ym-chips' });
				tasks.slice(0, m.maxChips).forEach((t) => chip(box2, t, m, h, drag));
				if (tasks.length > m.maxChips) box2.createSpan({ cls: 'ym-more', text: `+${tasks.length - m.maxChips}` });
			}
			cell.addEventListener('click', (evt) => {
				if (drag.suppressClick) {
					drag.suppressClick = false;
					return;
				}
				h.clickDay(d.iso, evt);
			});
			cell.addEventListener('contextmenu', (evt) => {
				evt.preventDefault();
				h.dayMenu(d.iso, evt);
			});
			cell.addEventListener('pointerdown', (evt) => {
				if (evt.button !== 0) return;
				drag.from = d.iso;
				drag.to = d.iso;
				drag.moved = false;
				paint();
			});
			cell.addEventListener('pointerenter', (evt) => {
				if (!drag.from) return;
				// the button was let go somewhere the grid did not see
				if ((evt.buttons & 1) === 0) {
					cancelSelection();
					return;
				}
				if (d.iso !== drag.from) drag.moved = true;
				drag.to = d.iso;
				paint();
			});
			cell.addEventListener('pointerup', () => endSelection());
			cell.addEventListener('dragover', (evt) => {
				if (!drag.task) return;
				evt.preventDefault();
				cell.addClass('is-drop');
			});
			cell.addEventListener('dragleave', () => cell.removeClass('is-drop'));
			cell.addEventListener('drop', (evt) => {
				cell.removeClass('is-drop');
				const t = drag.task;
				drag.task = null;
				if (!t) return;
				evt.preventDefault();
				if (t.iso !== d.iso) h.reschedule(t.path, t.iso, t.kind, d.iso);
			});
		}
		for (const s of segs) {
			const cls = ['ym-bar'];
			if (!s.startsHere) cls.push('cont-left');
			if (!s.endsHere) cls.push('cont-right');
			if (s.item.milestone) cls.push('is-mark');
			// a single day with an icon is its icon alone: a name would not fit in one cell
			const oneDay = s.item.start === s.item.end && s.item.icon !== '';
			if (oneDay) cls.push('is-day');
			const text = oneDay ? s.item.icon : s.item.icon ? `${s.item.icon} ${s.item.title}` : s.item.title;
			const bar = days.createDiv({ cls, text, attr: { 'data-path': s.item.path, 'aria-label': s.item.title, role: 'button', tabindex: '0',
				title: `${s.item.title} · ${rangeLabel(s.item.start, s.item.end, m.monthNames)}` } });
			bar.setCssProps({ '--ym-cols': `${s.startCol + 1} / ${s.endCol + 2}`, '--ym-row': String(s.lane + 2), '--ym-color': s.item.color });
			bar.addEventListener('click', (evt) => h.clickEvent(s.item.path, evt));
			bar.addEventListener('contextmenu', (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				h.eventMenu(s.item.path, evt);
			});
			bar.addEventListener('keydown', (evt) => {
				if (evt.key === 'Enter') h.clickEvent(s.item.path);
			});
			if (h.hover) {
				const hover = h.hover;
				bar.addEventListener('mouseover', (evt) => hover(s.item.path, bar, evt));
			}
		}
		label('right');
	});
	weekdayRow(grid, m, 'bottom');
	root.addEventListener('pointerleave', cancelSelection);
	// the browser took the pointer over, for a scroll or a drag of its own
	root.addEventListener('pointercancel', cancelSelection);
	root.createDiv({ cls: 'ym-credit', text: 'After The Linear Calendar by Nick Milo (Linking Your Thinking), CC BY 4.0.' });
}
