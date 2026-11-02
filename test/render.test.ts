/* The year drawn: Nick Milo's grid, the days that have a note, the tasks on their days, the events as bars, and every
 * gesture handed back to the plugin. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, fakeTransfer } from './fakedom.ts';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/settings-model.ts';
import { taskSettingsFrom, type NoteFacts } from '../src/sources.ts';
import { buildModel, rangeLabel, signatureOf, type YearModel } from '../src/model.ts';
import { renderYear, type Handlers } from '../src/render.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const notes: NoteFacts[] = [
	{ path: 'T/a.md', name: 'a', fm: { title: 'Submit the paper', status: 'to-do', due: '2026-10-05' }, tags: ['task'] },
	{ path: 'T/b.md', name: 'b', fm: { status: 'to-do', scheduled: '2026-10-05' }, tags: ['task'] },
	{ path: 'T/c.md', name: 'c', fm: { status: 'to-do', scheduled: '2026-10-05' }, tags: ['task'] },
	{ path: 'T/d.md', name: 'd', fm: { status: 'to-do', scheduled: '2026-10-05' }, tags: ['task'] },
	{ path: 'T/e.md', name: 'e', fm: { status: 'to-do', due: '2026-09-20' }, tags: ['task'] },
	{ path: 'Year Map/Lisbon.md', name: 'Lisbon', fm: { start: '2026-07-30', end: '2026-08-02', color: '#1c7ed6' }, tags: [] },
];

function model(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): YearModel {
	const settings = mergeSettings({ ...overrides });
	return buildModel({
		year: 2026,
		settings,
		notes,
		taskSettings: taskSettingsFrom(undefined, settings),
		daily: new Map([['2026-10-01', 'Daily/2026-10-01.md']]),
		today: '2026-10-01',
		monthNames: MONTHS,
		weekdayNames: WEEKDAYS,
	});
}

function calls(): { log: unknown[][]; h: Handlers } {
	const log: unknown[][] = [];
	const rec = (name: string) => (...a: unknown[]) => { log.push([name, ...a]); };
	return {
		log,
		h: {
			openDay: rec('openDay'),
			clickDay: rec('clickDay'),
			dayMenu: rec('dayMenu'),
			openMonth: rec('openMonth'),
			openYear: rec('openYear'),
			openNote: rec('openNote'),
			clickEvent: rec('clickEvent'),
			eventMenu: rec('eventMenu'),
			planRange: rec('planRange'),
			reschedule: rec('reschedule'),
			prevYear: rec('prevYear'),
			nextYear: rec('nextYear'),
			thisYear: rec('thisYear'),
		},
	};
}

const draw = (m: YearModel): { root: FakeEl; log: unknown[][] } => {
	const root = new FakeEl();
	const { log, h } = calls();
	renderYear(root as unknown as HTMLElement, m, h);
	return { root, log };
};

test('the model: tasks by day, the year\'s title, today', () => {
	const m = model();
	assert.equal(m.title, '2026');
	assert.equal(m.tasksByDay.get('2026-10-05')?.length, 4);
	assert.equal(m.today, '2026-10-01');
	assert.equal(m.layout.rows[6]?.[0]?.item.title, 'Lisbon');
	assert.equal(model({ title: 'My year' }).title, 'My year');
	const other = buildModel({ year: 2027, settings: mergeSettings({}), notes, taskSettings: taskSettingsFrom(undefined, DEFAULT_SETTINGS),
		daily: new Map(), today: '2026-10-01', monthNames: MONTHS, weekdayNames: WEEKDAYS });
	assert.equal(other.today, null, 'today is not on another year\'s map');
});

test('twelve rows of 37 cells, the empty ones too, and the weekend columns shaded in every row', () => {
	const { root } = draw(model({ weekendDays: [5, 6] }));
	const months = root.all('ym-month');
	assert.equal(months.length, 12);
	for (const row of months) assert.equal(row.all('ym-cell').length, 37);
	const feb = months[1];
	assert.ok(feb);
	assert.equal(feb.all('ym-cell').filter((c) => c.attrs.has('data-iso')).length, 28);
	assert.equal(root.all('ym-cell').filter((c) => c.hasClass('is-weekend')).length, 120, 'Fridays and Saturdays: 10 columns, 12 rows');
	assert.equal(root.all('ym-wd').length, 74, 'the weekdays above and below');
});

test('a day shows its number as the template does, with today and a day that has a note marked', () => {
	const { root } = draw(model());
	const jan1 = root.find('data-iso', '2026-01-01');
	assert.ok(jan1);
	assert.equal(jan1.all('ym-num')[0]?.text, '01');
	assert.ok(root.find('data-iso', '2026-10-01')?.hasClass('is-today'));
	assert.ok(root.find('data-iso', '2026-10-01')?.hasClass('has-note'));
	assert.ok(!root.find('data-iso', '2026-10-02')?.hasClass('has-note'));
});

test('tasks sit on their day in their colour, overdue marked, and past the limit a count stands in', () => {
	const { root } = draw(model({ maxChips: 3 }));
	const day = root.find('data-iso', '2026-10-05');
	assert.ok(day);
	const chips = day.all('ym-task');
	assert.equal(chips.length, 3);
	assert.equal(chips[0]?.attrs.get('data-path'), 'T/a.md');
	assert.ok(chips[0]?.css.get('--ym-color'));
	assert.equal(day.all('ym-more')[0]?.text, '+1');
	assert.ok(root.find('data-iso', '2026-09-20')?.all('ym-task')[0]?.hasClass('is-overdue'));
});

test('an event is a bar across its days, cut where the month ends', () => {
	const { root } = draw(model());
	const bars = root.all('ym-bar');
	assert.equal(bars.length, 2, 'July and August');
	const [jul, aug] = bars;
	assert.ok(jul && aug);
	assert.equal(jul.text, 'Lisbon');
	assert.ok(jul.hasClass('cont-right'));
	assert.ok(aug.hasClass('cont-left'));
	assert.equal(jul.css.get('--ym-color'), '#1c7ed6');
	// July 2026 starts on a Wednesday (column 3), so the 30th is column 32: grid lines 33 to 35
	assert.equal(jul.css.get('--ym-cols'), '33 / 35');
	assert.equal(jul.css.get('--ym-row'), '2');
});

test('clicks: a day, a month, the title, a task, a bar, and the year buttons', () => {
	const { root, log } = draw(model());
	root.find('data-iso', '2026-03-14')?.fire('click');
	root.all('ym-mlabel')[0]?.fire('click');
	root.all('ym-title')[0]?.fire('click');
	root.find('data-iso', '2026-10-05')?.all('ym-task')[0]?.fire('click');
	root.all('ym-bar')[0]?.fire('click');
	const right = root.all('ym-bar')[0]?.fire('contextmenu');
	assert.ok(right?.defaultPrevented && right.propagationStopped, 'a right-click on a bar is for the bar alone');
	root.all('ym-prev')[0]?.fire('click');
	root.all('ym-next')[0]?.fire('click');
	root.all('ym-today')[0]?.fire('click');
	// the year's title passes its click on, so a modified click can open the year's note in a new tab; a day's click goes
	// to the plugin, which asks, opens the note or adds an event (1.1); a bar's too, which opens or edits it (1.2)
	assert.deepEqual(log.map((x) => [x[0], typeof x[1] === 'object' ? 'event' : x[1]]), [
		['clickDay', '2026-03-14'], ['openMonth', 0], ['openYear', 'event'], ['openNote', 'T/a.md'],
		['clickEvent', 'Year Map/Lisbon.md'], ['eventMenu', 'Year Map/Lisbon.md'], ['prevYear', undefined], ['nextYear', undefined], ['thisYear', undefined],
	]);
});

test('dragging across days plans a span; a press and release on one day opens it', () => {
	const { root, log } = draw(model());
	const a = root.find('data-iso', '2026-04-08');
	const b = root.find('data-iso', '2026-04-11');
	assert.ok(a && b);
	a.fire('pointerdown', { button: 0 });
	b.fire('pointerenter', { buttons: 1 });
	assert.ok(root.find('data-iso', '2026-04-09')?.hasClass('is-selecting'), 'the days between light up');
	b.fire('pointerup');
	assert.deepEqual(log.at(-1), ['planRange', '2026-04-08', '2026-04-11']);
	assert.ok(!root.find('data-iso', '2026-04-09')?.hasClass('is-selecting'));
});

test('a press on a task does not start a plan, and a drag cut short plans nothing', () => {
	const { root, log } = draw(model());
	const cell = root.find('data-iso', '2026-10-05');
	const other = root.find('data-iso', '2026-10-08');
	assert.ok(cell && other);
	cell.all('ym-task')[0]?.dispatch('pointerdown', { button: 0 });
	other.fire('pointerenter', { buttons: 1 });
	other.fire('pointerup');
	assert.ok(!log.some((x) => x[0] === 'planRange'), 'the task is dragged, not the days under it');

	cell.fire('pointerdown', { button: 0 });
	other.fire('pointerenter', { buttons: 1 });
	assert.ok(root.find('data-iso', '2026-10-06')?.hasClass('is-selecting'));
	root.all('ym')[0]?.fire('pointercancel');
	assert.ok(!root.find('data-iso', '2026-10-06')?.hasClass('is-selecting'), 'the browser took the pointer: the plan is dropped');
	other.fire('pointerup');
	assert.ok(!log.some((x) => x[0] === 'planRange'));

	cell.fire('pointerdown', { button: 0 });
	other.fire('pointerenter', { buttons: 0 });
	other.fire('pointerup');
	assert.ok(!log.some((x) => x[0] === 'planRange'), 'the button was let go elsewhere: no plan');
});

test('a task dropped on another day is rescheduled, when the settings allow it', () => {
	const { root, log } = draw(model());
	const chip = root.find('data-iso', '2026-10-05')?.all('ym-task')[1];
	assert.ok(chip?.draggable, 'draggable');
	const dt = fakeTransfer();
	chip.fire('dragstart', { dataTransfer: dt });
	const target = root.find('data-iso', '2026-10-08');
	assert.ok(target);
	const over = target.fire('dragover', { dataTransfer: dt });
	assert.ok(over.defaultPrevented, 'the day accepts the drop');
	target.fire('drop', { dataTransfer: dt });
	assert.deepEqual(log.at(-1), ['reschedule', 'T/b.md', '2026-10-05', 'scheduled', '2026-10-08']);

	const locked = draw(model({ tasks: { ...DEFAULT_SETTINGS.tasks, dragReschedule: false } }));
	assert.equal(locked.root.find('data-iso', '2026-10-05')?.all('ym-task')[0]?.draggable, false);
});

test('a layer turned off draws nothing of it', () => {
	const { root } = draw(model({
		tasks: { ...DEFAULT_SETTINGS.tasks, enabled: false },
		events: { ...DEFAULT_SETTINGS.events, enabled: false },
		days: { ...DEFAULT_SETTINGS.days, enabled: false },
	}));
	assert.equal(root.all('ym-task').length, 0);
	assert.equal(root.all('ym-bar').length, 0);
	assert.equal(root.all('ym-cell').filter((c) => c.hasClass('has-note')).length, 0);
});

test('the design is credited', () => {
	const { root } = draw(model());
	assert.match(root.all('ym-credit')[0]?.textContent ?? '', /Nick Milo/);
});

test('a span of days in words, for the planning window', () => {
	assert.equal(rangeLabel('2026-04-08', '2026-04-11', MONTHS), '8 Apr – 11 Apr 2026');
	assert.equal(rangeLabel('2026-04-08', '2026-04-08', MONTHS), '8 Apr 2026');
	assert.equal(rangeLabel('2026-12-30', '2027-01-02', MONTHS), '30 Dec 2026 – 2 Jan 2027');
});

test('a model\'s signature changes with what it draws, and only then', () => {
	assert.equal(signatureOf(model()), signatureOf(model()), 'the same notes draw the same year');
	const moved = notes.map((n) => (n.path === 'T/a.md' ? { ...n, fm: { ...n.fm, due: '2026-10-06' } } : n));
	const other = buildModel({ year: 2026, settings: mergeSettings({}), notes: moved, taskSettings: taskSettingsFrom(undefined, DEFAULT_SETTINGS),
		daily: new Map([['2026-10-01', 'Daily/2026-10-01.md']]), today: '2026-10-01', monthNames: MONTHS, weekdayNames: WEEKDAYS });
	assert.notEqual(signatureOf(other), signatureOf(model()));
	assert.notEqual(signatureOf(model({ density: 'compact' })), signatureOf(model()));
});
