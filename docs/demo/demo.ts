/*
 * The README's screenshots: a year of made-up plans drawn by the plugin's own model and renderer on a page styled like
 * Obsidian. `node docs/demo/build.mjs` bundles this file; the page loads the bundle.
 */
import { buildModel } from '../../src/model.ts';
import { renderYear } from '../../src/render.ts';
import { mergeSettings } from '../../src/settings-model.ts';
import { taskSettingsFrom, type NoteFacts } from '../../src/sources.ts';

type Info = { cls?: string | string[]; text?: string; attr?: Record<string, string> };
type Helpers = {
	createEl(tag: string, o?: Info): HTMLElement;
	createDiv(o?: Info): HTMLElement;
	createSpan(o?: Info): HTMLElement;
	setText(t: string): void;
	addClass(...cs: string[]): void;
	removeClass(...cs: string[]): void;
	toggleClass(c: string, on: boolean): void;
	setCssProps(props: Record<string, string>): void;
	empty(): void;
};

// The helpers Obsidian adds to every element.
const proto = HTMLElement.prototype as unknown as Helpers & HTMLElement;
proto.createEl = function (this: HTMLElement, tag: string, o: Info = {}) {
	const el = document.createElement(tag);
	const cls = Array.isArray(o.cls) ? o.cls : o.cls ? [o.cls] : [];
	for (const c of cls) if (c) el.classList.add(c);
	if (o.text !== undefined) el.textContent = o.text;
	for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
	this.appendChild(el);
	return el;
};
proto.createDiv = function (this: Helpers, o?: Info) {
	return this.createEl('div', o);
};
proto.createSpan = function (this: Helpers, o?: Info) {
	return this.createEl('span', o);
};
proto.setText = function (this: HTMLElement, t: string) {
	this.textContent = t;
};
proto.addClass = function (this: HTMLElement, ...cs: string[]) {
	this.classList.add(...cs);
};
proto.removeClass = function (this: HTMLElement, ...cs: string[]) {
	this.classList.remove(...cs);
};
proto.toggleClass = function (this: HTMLElement, c: string, on: boolean) {
	this.classList.toggle(c, on);
};
proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
	for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
};
proto.empty = function (this: HTMLElement) {
	this.replaceChildren();
};

const task = (name: string, fm: Record<string, unknown>): NoteFacts => ({ path: `Tasks/${name}.md`, name, fm: { title: name, ...fm }, tags: ['task'] });
const event = (title: string, start: string, end: string, category: string, more: Record<string, unknown> = {}): NoteFacts =>
	({ path: `Year Map/${title}.md`, name: title, fm: { title, start, end, category, ...more }, tags: [] });

const notes: NoteFacts[] = [
	task('Submit the conference paper', { status: 'done', due: '2026-09-15' }),
	task('Send the reviews back', { status: 'to-do', due: '2026-09-28' }),
	task('Thesis proposal draft', { status: 'in-progress', scheduled: '2026-10-08' }),
	task('Book the flights', { status: 'to-do', scheduled: '2026-10-08' }),
	task('Renew the car licence', { status: 'to-do', due: '2026-10-21' }),
	task('Quarterly review', { status: 'to-do', scheduled: '2026-12-31' }),
	task('Lab safety course', { status: 'done', due: '2026-03-04' }),
	task('Grant report', { status: 'to-do', due: '2026-11-12' }),
	// Ramadan and the Eid repeat on the Hijri calendar, the birthday every year, the conference carries its deadline
	event('Ramadan', '2026-02-18', '2026-03-19', 'Holiday', { repeat: 'yearly', calendar: 'hijri' }),
	event('Eid al-Fitr', '2026-03-20', '2026-03-22', 'Holiday', { repeat: 'yearly', calendar: 'hijri', icon: '🎉' }),
	event('Family trip', '2026-03-23', '2026-03-28', 'Trip'),
	event('Conference', '2026-06-01', '2026-06-05', 'Conference', { deadline: '2026-01-15' }),
	event('Summer school', '2026-07-12', '2026-07-24', 'Education'),
	event('Writing retreat', '2026-07-20', '2026-08-06', 'Work'),
	event('A birthday', '2026-05-09', '2026-05-09', 'Birthday', { repeat: 'yearly' }),
	event('Exams', '2026-12-06', '2026-12-17', 'Education'),
	event('Semester starts', '2026-08-30', '2026-08-30', 'Education', { icon: '🎓' }),
	event('Black Friday', '2026-11-27', '2026-11-30', 'Sale'),
];

const daily = new Map<string, string>();
for (let d = 1; d <= 30; d++) if (d % 3 !== 0) daily.set(`2026-09-${String(d).padStart(2, '0')}`, `Daily/${d}.md`);
daily.set('2026-10-01', 'Daily/today.md');

const settings = mergeSettings({ weekendDays: [5, 6] });
const model = buildModel({
	year: 2026,
	settings,
	notes,
	taskSettings: taskSettingsFrom(undefined, settings),
	daily,
	today: '2026-10-01',
	monthNames: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
	weekdayNames: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
});
const noop = (): void => {};
const target = document.getElementById('year');
if (target) {
	renderYear(target, model, {
		openDay: noop, clickDay: noop, dayMenu: noop, openMonth: noop, openYear: noop, openNote: noop, clickEvent: noop, eventMenu: noop, planRange: noop, reschedule: noop,
		prevYear: noop, nextYear: noop, thisYear: noop,
	});
}
