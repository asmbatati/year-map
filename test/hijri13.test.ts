/* What 1.3 adds to the days that come back: Umm al-Qura moved by a day or two where the announced day differs, a date
 * a year's occurrence was observed on taking its place, and the title a new vault starts with. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/settings-model.ts';
import { eventsFrom, taskSettingsFrom, type NoteFacts } from '../src/sources.ts';
import { hijriAvailable, occurrencesIn } from '../src/recur.ts';
import { buildModel } from '../src/model.ts';

const note = (path: string, fm: Record<string, unknown>): NoteFacts =>
	({ path, name: path.split('/').pop()?.replace(/\.md$/, '') ?? path, fm, tags: [] });
const es = mergeSettings({ events: { folders: ['Plans'] } }).events;

// 1 to 30 Ramadan 1447, and 1 to 3 Shawwal 1447, the first Eid
const RAMADAN = ['2026-02-18', '2026-03-19'] as const;
const EID = ['2026-03-20', '2026-03-22'] as const;
// 6 Ramadan 1447: on Umm al-Qura it falls on 10 Jan and 31 Dec 2030, and 21 Dec 2031
const SIXTH = ['2026-02-23', '2026-02-23'] as const;
const hijri = { hijri: true };

test('a Hijri offset moves every day Umm al-Qura computes, and leaves the days a note gives as written', () => {
	assert.deepEqual(occurrencesIn(...RAMADAN, 2027, hijri), [{ start: '2027-02-08', end: '2027-03-08' }], 'no offset');
	assert.deepEqual(occurrencesIn(...RAMADAN, 2027, { ...hijri, offset: 1 }), [{ start: '2027-02-09', end: '2027-03-09' }]);
	assert.deepEqual(occurrencesIn(...RAMADAN, 2027, { ...hijri, offset: -1 }), [{ start: '2027-02-07', end: '2027-03-07' }]);
	assert.deepEqual(occurrencesIn(...RAMADAN, 2026, { ...hijri, offset: 1 }), [{ start: '2026-02-18', end: '2026-03-19' }], 'the note\'s own year');
});

test('the offset is at most two days either way, and a Gregorian repeat has none', () => {
	assert.deepEqual(occurrencesIn(...RAMADAN, 2027, { ...hijri, offset: 5 }), [{ start: '2027-02-10', end: '2027-03-10' }]);
	assert.deepEqual(occurrencesIn(...RAMADAN, 2027, { ...hijri, offset: -9 }), [{ start: '2027-02-06', end: '2027-03-06' }]);
	assert.deepEqual(occurrencesIn(...RAMADAN, 2027, { ...hijri, offset: Number.NaN }), [{ start: '2027-02-08', end: '2027-03-08' }]);
	assert.deepEqual(occurrencesIn('2026-11-19', '2026-11-19', 2027, { hijri: false, offset: 1 }), [{ start: '2027-11-19', end: '2027-11-19' }]);
});

test('a day the offset moves across the turn of the year is drawn in the year it lands in', () => {
	assert.deepEqual(occurrencesIn(...SIXTH, 2030, hijri).map((o) => o.start), ['2030-01-10', '2030-12-31']);
	assert.deepEqual(occurrencesIn(...SIXTH, 2030, { ...hijri, offset: 1 }).map((o) => o.start), ['2030-01-11']);
	assert.deepEqual(occurrencesIn(...SIXTH, 2031, { ...hijri, offset: 1 }).map((o) => o.start), ['2031-01-01', '2031-12-22']);
});

test('a date a year\'s occurrence was observed on takes its place, keeping its length', () => {
	assert.deepEqual(occurrencesIn(...EID, 2027, hijri), [{ start: '2027-03-09', end: '2027-03-11' }]);
	assert.deepEqual(occurrencesIn(...EID, 2027, { ...hijri, observed: ['2027-03-10'] }), [{ start: '2027-03-10', end: '2027-03-12' }]);
	assert.deepEqual(occurrencesIn(...EID, 2027, { ...hijri, offset: 1, observed: ['2027-03-09'] }), [{ start: '2027-03-09', end: '2027-03-11' }],
		'over the offset');
	assert.deepEqual(occurrencesIn(...EID, 2027, { ...hijri, observed: ['2028-02-27'] }), [{ start: '2027-03-09', end: '2027-03-11' }],
		'another year\'s date');
	assert.deepEqual(occurrencesIn(...EID, 2027, { ...hijri, observed: ['2027-06-01'] }), [{ start: '2027-03-09', end: '2027-03-11' }],
		'too far from any occurrence');
	assert.deepEqual(occurrencesIn('2026-11-19', '2026-11-19', 2027, { hijri: false, observed: ['2027-11-21'] }),
		[{ start: '2027-11-21', end: '2027-11-21' }], 'a Gregorian repeat too');
});

test('an occurrence observed across the turn of the year moves to the year it was observed in', () => {
	const o = { ...hijri, observed: ['2031-01-01'] };
	assert.deepEqual(occurrencesIn(...SIXTH, 2030, o).map((x) => x.start), ['2030-01-10']);
	assert.deepEqual(occurrencesIn(...SIXTH, 2031, o).map((x) => x.start), ['2031-01-01', '2031-12-21']);
});

test('a note gives its observed dates, one or a list, and the settings give the offset and the property\'s name', () => {
	const eid = { start: EID[0], end: EID[1], repeat: 'yearly', calendar: 'hijri' };
	const days = (n: NoteFacts, e = es): string[][] => eventsFrom([n], e, { year: 2027 }).map((x) => [x.start, x.end]);
	assert.deepEqual(days(note('Plans/Eid.md', { ...eid, observed: '2027-03-10' })), [['2027-03-10', '2027-03-12']]);
	assert.deepEqual(days(note('Plans/Eid.md', { ...eid, observed: ['2027-03-10', '2028-02-27'] })), [['2027-03-10', '2027-03-12']]);
	assert.deepEqual(days(note('Plans/Eid.md', { ...eid, seen: '2027-03-10' }), { ...es, observedKey: 'seen' }), [['2027-03-10', '2027-03-12']]);
	assert.deepEqual(days(note('Plans/Ramadan.md', { start: RAMADAN[0], end: RAMADAN[1], repeat: 'yearly', calendar: 'hijri' }), { ...es, hijriOffset: 1 }),
		[['2027-02-09', '2027-03-09']]);
});

test('a new vault starts with the year alone for a title, no line under it, no offset, and `observed` for the dates', () => {
	assert.equal(DEFAULT_SETTINGS.title, '{year}');
	assert.equal(DEFAULT_SETTINGS.tagline, '');
	assert.equal(DEFAULT_SETTINGS.events.hijriOffset, 0);
	assert.equal(DEFAULT_SETTINGS.events.observedKey, 'observed');
	assert.equal(mergeSettings({ title: '{year} Linear Calendar' }).title, '{year} Linear Calendar', 'a vault that set its own keeps it');
	assert.equal(mergeSettings({ events: { folders: ['Plans'] } }).events.hijriOffset, 0, 'settings saved before 1.3');
});

test('where the platform has Umm al-Qura, the map says nothing about it', () => {
	assert.equal(hijriAvailable(), true);
	const settings = mergeSettings({ events: { folders: ['Plans'] } });
	const m = buildModel({
		year: 2027, settings, notes: [note('Plans/Ramadan.md', { start: RAMADAN[0], end: RAMADAN[1], repeat: 'yearly', calendar: 'hijri' })],
		taskSettings: taskSettingsFrom(undefined, settings), daily: new Map(), today: '2026-10-01', monthNames: [], weekdayNames: [],
	});
	assert.equal(m.notice, '');
	assert.equal(m.title, '2027');
});
