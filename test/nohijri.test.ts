/* A platform without the Umm al-Qura calendar, whose Intl answers in the Gregorian calendar when asked for it. An event
 * that repeats on the Hijri calendar is then drawn on the days its note gives, and the map says why. `node --test` runs
 * each file in a process of its own, so the stand-in Intl reaches no other test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl } from './fakedom.ts';

const Real = Intl.DateTimeFormat;
const Gregorian = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const asked = [locales ?? []].flat().join(',');
	return new Real(asked.includes('islamic') ? 'en-u-ca-gregory' : locales, options);
} as unknown as typeof Intl.DateTimeFormat;
Object.defineProperty(Intl, 'DateTimeFormat', { value: Gregorian, configurable: true, writable: true });

const { mergeSettings } = await import('../src/settings-model.ts');
const { eventsFrom, taskSettingsFrom } = await import('../src/sources.ts');
const { hijriAvailable } = await import('../src/recur.ts');
const { buildModel } = await import('../src/model.ts');
const { renderYear } = await import('../src/render.ts');
type NoteFacts = import('../src/sources.ts').NoteFacts;
type YearModel = import('../src/model.ts').YearModel;
type Handlers = import('../src/render.ts').Handlers;

const note = (path: string, fm: Record<string, unknown>): NoteFacts =>
	({ path, name: path.split('/').pop()?.replace(/\.md$/, '') ?? path, fm, tags: [] });
const ramadan = note('Plans/Ramadan.md', { start: '2026-02-18', end: '2026-03-19', repeat: 'yearly', calendar: 'hijri', category: 'Holiday' });
const birthday = note('Plans/Me.md', { start: '2026-11-19', repeat: 'yearly' });
const settings = mergeSettings({ events: { folders: ['Plans'] } });

function model(year: number, notes: NoteFacts[]): YearModel {
	return buildModel({ year, settings, notes, taskSettings: taskSettingsFrom(undefined, settings), daily: new Map(), today: '2026-10-01',
		monthNames: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], weekdayNames: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] });
}

function draw(m: YearModel): FakeEl {
	const root = new FakeEl();
	const none = (): void => undefined;
	const h: Handlers = {
		openDay: none, clickDay: none, dayMenu: none, openMonth: none, openYear: none, openNote: none, clickEvent: none, eventMenu: none,
		planRange: none, reschedule: none, prevYear: none, nextYear: none, thisYear: none,
	};
	renderYear(root as unknown as HTMLElement, m, h);
	return root;
}

test('without Umm al-Qura, an event that repeats on it is drawn once, on the days its note gives', () => {
	assert.equal(hijriAvailable(), false);
	const ev = eventsFrom([ramadan, birthday], settings.events, { year: 2027 });
	assert.deepEqual(ev.map((e) => [e.path, e.start, e.end]), [
		['Plans/Ramadan.md', '2026-02-18', '2026-03-19'],
		['Plans/Me.md', '2027-11-19', '2027-11-19'],
	]);
	assert.equal(ev[0]?.noCalendar, true);
	assert.equal(ev[1]?.noCalendar, undefined, 'a Gregorian repeat needs no calendar of its own');
});

test('the map says so, in every year, and only when a note asks for the Hijri calendar', () => {
	for (const year of [2026, 2027]) assert.match(model(year, [ramadan, birthday]).notice, /Umm al-Qura/, String(year));
	assert.equal(model(2027, [birthday]).notice, '');
	assert.match(draw(model(2027, [ramadan])).all('ym-notice')[0]?.textContent ?? '', /Umm al-Qura/);
	assert.equal(draw(model(2027, [birthday])).all('ym-notice').length, 0);
});
