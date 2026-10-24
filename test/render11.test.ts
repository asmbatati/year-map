/* What 1.1 draws: each bar with its icon, a legend of the kinds the year shows, each quarter on its own tint, and a
 * click on a day handed to the plugin (which asks, opens the note or adds an event), a right-click always asking. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl } from './fakedom.ts';
import { mergeSettings, type SavedSettings } from '../src/settings-model.ts';
import { taskSettingsFrom, type NoteFacts } from '../src/sources.ts';
import { buildModel, signatureOf, type YearModel } from '../src/model.ts';
import { renderYear, type Handlers } from '../src/render.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const notes: NoteFacts[] = [
	{ path: 'Year Map/Sam.md', name: 'Sam', fm: { start: '2026-09-08', repeat: 'yearly', category: 'Birthday' }, tags: [] },
	{ path: 'Year Map/Ramadan.md', name: 'Ramadan', fm: { start: '2026-02-18', end: '2026-03-19', repeat: 'yearly', calendar: 'hijri', category: 'Holiday' }, tags: [] },
	{ path: 'Year Map/ICRA 2027.md', name: 'ICRA 2027', fm: { start: '2027-06-01', end: '2027-06-04', deadline: '2026-09-15', category: 'Conference' }, tags: [] },
	{ path: 'Year Map/Plain.md', name: 'Plain', fm: { start: '2026-05-05' }, tags: [] },
];

function model(year = 2026, saved: SavedSettings = {}): YearModel {
	const settings = mergeSettings(saved);
	return buildModel({ year, settings, notes, taskSettings: taskSettingsFrom(undefined, settings), daily: new Map(),
		today: '2026-10-01', monthNames: MONTHS, weekdayNames: WEEKDAYS });
}

function draw(m: YearModel): { root: FakeEl; log: unknown[][] } {
	const root = new FakeEl();
	const log: unknown[][] = [];
	const rec = (name: string) => (...a: unknown[]) => { log.push([name, ...a]); };
	const h: Handlers = {
		openDay: rec('openDay'), clickDay: rec('clickDay'), dayMenu: rec('dayMenu'), openMonth: rec('openMonth'),
		openYear: rec('openYear'), openNote: rec('openNote'), clickEvent: rec('clickEvent'), eventMenu: rec('eventMenu'), planRange: rec('planRange'), reschedule: rec('reschedule'),
		prevYear: rec('prevYear'), nextYear: rec('nextYear'), thisYear: rec('thisYear'),
	};
	renderYear(root as unknown as HTMLElement, m, h);
	return { root, log };
}

test('a bar starts with its icon, and says its whole name to a reader', () => {
	const { root } = draw(model());
	const ramadan = root.all('ym-bar').find((b) => b.attrs.get('data-path') === 'Year Map/Ramadan.md');
	assert.ok(ramadan);
	assert.equal(ramadan.text, '🌙 Ramadan');
	assert.equal(ramadan.attrs.get('aria-label'), 'Ramadan');
	const sam = root.all('ym-bar').find((b) => b.attrs.get('data-path') === 'Year Map/Sam.md');
	assert.equal(sam?.text, '🎂', 'one day: the icon alone');
	const plain = root.all('ym-bar').find((b) => b.attrs.get('data-path') === 'Year Map/Plain.md');
	assert.equal(plain?.text, 'Plain', 'no icon, no space');
});

test('a one-day event with an icon is its icon alone, its name in the tooltip; a longer one says both', () => {
	const { root } = draw(model());
	const sam = root.all('ym-bar').find((b) => b.attrs.get('data-path') === 'Year Map/Sam.md');
	assert.ok(sam?.hasClass('is-day'));
	assert.equal(sam?.attrs.get('title'), 'Sam · 8 Sep 2026');
	const ramadan = root.all('ym-bar').find((b) => b.attrs.get('data-path') === 'Year Map/Ramadan.md');
	assert.ok(ramadan && !ramadan.hasClass('is-day'));
	assert.equal(ramadan.attrs.get('title'), 'Ramadan · 18 Feb – 19 Mar 2026');
});

test('repeats and deadlines are on the map of the year they fall in', () => {
	const m26 = model(2026);
	const titles26 = m26.layout.rows.flat().map((s) => s.item.title);
	assert.ok(titles26.includes('ICRA 2027 · deadline'), 'the 2026 deadline of a 2027 conference');
	assert.ok(!titles26.includes('ICRA 2027'));
	const m27 = model(2027);
	const feb27 = m27.layout.rows[1]?.find((s) => s.item.path === 'Year Map/Ramadan.md');
	assert.ok(feb27, 'Ramadan 1448 starts on 8 Feb 2027');
	assert.equal(feb27.startCol, m27.rows[1]?.days[7]?.col);
});

test('a legend names the kinds the year shows, in the settings\' order', () => {
	const { root } = draw(model());
	const items = root.all('ym-legend-item');
	// the 2027 conference is not on the 2026 map, its deadline is; a note with no kind adds none
	assert.deepEqual(items.map((i) => i.text), ['⏰ Deadline', '🌙 Holiday', '🎂 Birthday']);
	assert.equal(items[0]?.css.get('--ym-color'), '#e03131');
	assert.equal(draw(model(2026, { legend: false })).root.all('ym-legend').length, 0, 'off');
});

test('each quarter on its own tint, as the template does it, unless turned off', () => {
	const { root } = draw(model());
	const months = root.all('ym-month');
	assert.equal(months[0]?.css.get('--ym-qtint'), '#fcf7ff');
	assert.equal(months[4]?.css.get('--ym-qtint'), '#fffef6');
	assert.equal(months[7]?.css.get('--ym-qtint'), '#ebffff');
	assert.equal(months[11]?.css.get('--ym-qtint'), '#fef3f7');
	assert.ok(months[2]?.hasClass('ym-q1') && months[3]?.hasClass('ym-q2'));
	assert.ok(months[0]?.hasClass('has-tint'));
	const plain = draw(model(2026, { quarters: { enabled: false } })).root.all('ym-month');
	assert.ok(!plain[0]?.hasClass('has-tint'));
	assert.equal(plain[0]?.css.get('--ym-qtint'), undefined);
});

test('a click on a day goes to the plugin, a right-click asks; a drag still plans', () => {
	const { root, log } = draw(model());
	root.find('data-iso', '2026-11-19')?.fire('click');
	root.find('data-iso', '2026-11-20')?.fire('contextmenu');
	assert.deepEqual(log.map((x) => [x[0], x[1]]), [['clickDay', '2026-11-19'], ['dayMenu', '2026-11-20']]);
	const a = root.find('data-iso', '2026-04-08');
	const b = root.find('data-iso', '2026-04-10');
	a?.fire('pointerdown', { button: 0 });
	b?.fire('pointerenter', { buttons: 1 });
	b?.fire('pointerup');
	b?.fire('click');
	assert.deepEqual(log.at(-1), ['planRange', '2026-04-08', '2026-04-10'], 'the click that ends a drag is not a click on a day');
});

test('the signature changes with an icon, a kind, the legend and the quarters', () => {
	const a = signatureOf(model());
	assert.notEqual(a, signatureOf(model(2026, { legend: false })));
	assert.notEqual(a, signatureOf(model(2026, { quarters: { colors: ['#000000'] } })));
	assert.notEqual(a, signatureOf(model(2026, { events: { categories: [{ name: 'Birthday', color: '#000000', icon: '🎈' }] } })));
});
