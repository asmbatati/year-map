/* Events in 1.1: kinds with a colour and an icon, a yearly repeat on the Gregorian or the Umm al-Qura calendar, an end
 * that is still open, and the dates inside an event (a conference's deadline) drawn as marks of their own. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, mergeSettings, parseCategories, formatCategories } from '../src/settings-model.ts';
import { eventsFrom, type NoteFacts } from '../src/sources.ts';
import { hijriOccurrences, toHijri, yearlyOccurrences } from '../src/recur.ts';

const note = (path: string, fm: Record<string, unknown>, tags: string[] = []): NoteFacts =>
	({ path, name: path.split('/').pop()?.replace(/\.md$/, '') ?? path, fm, tags });
const es = mergeSettings({ events: { folders: ['Plans'] } }).events;
const at = (year: number, today = '2026-10-01') => ({ year, today });

test('the kinds of event come with a colour and an icon, and the drawing\'s four lead', () => {
	const names = DEFAULT_SETTINGS.events.categories.map((c) => c.name);
	assert.deepEqual(names.slice(0, 4), ['Personal', 'Education', 'Work', 'Deadline']);
	for (const c of DEFAULT_SETTINGS.events.categories) {
		assert.match(c.color, /^#[0-9a-f]{6}$/i, c.name);
		assert.ok(c.icon.length > 0, c.name);
	}
});

test('kinds written one per line, name, colour and icon, read back and written again', () => {
	const cats = parseCategories('Birthday, #d6336c, 🎂\nTrip | #1098ad | ✈️\n\nbad line\nNo icon, #123456');
	assert.deepEqual(cats, [
		{ name: 'Birthday', color: '#d6336c', icon: '🎂' },
		{ name: 'Trip', color: '#1098ad', icon: '✈️' },
		{ name: 'No icon', color: '#123456', icon: '' },
	]);
	assert.equal(formatCategories(cats), 'Birthday, #d6336c, 🎂\nTrip, #1098ad, ✈️\nNo icon, #123456');
});

test('an event takes its kind\'s colour and icon; its own colour and icon win', () => {
	const ev = eventsFrom([
		note('Plans/Sam.md', { start: '2026-09-08', category: 'birthday' }),
		note('Plans/Trip.md', { start: '2026-07-03', end: '2026-07-20', category: 'Trip', icon: '🏝️', color: '#ff0000' }),
		note('Plans/Plain.md', { start: '2026-03-02' }),
		note('Plans/Unknown kind.md', { start: '2026-03-03', category: 'Nonesuch' }),
	], es, at(2026));
	const by = new Map(ev.map((e) => [e.path, e]));
	assert.equal(by.get('Plans/Sam.md')?.color, '#d6336c');
	assert.equal(by.get('Plans/Sam.md')?.icon, '🎂');
	assert.equal(by.get('Plans/Sam.md')?.category, 'Birthday', 'the kind as the settings spell it');
	assert.equal(by.get('Plans/Trip.md')?.color, '#ff0000');
	assert.equal(by.get('Plans/Trip.md')?.icon, '🏝️');
	assert.equal(by.get('Plans/Plain.md')?.color, es.defaultColor);
	assert.equal(by.get('Plans/Plain.md')?.icon, '');
	assert.equal(by.get('Plans/Unknown kind.md')?.color, es.defaultColor, 'a kind the settings do not know is no kind');
});

test('a yearly event comes back every year from its first, Feb 29 on the 28th in a common year', () => {
	assert.deepEqual(yearlyOccurrences('2026-11-19', '2026-11-19', 2027), [{ start: '2027-11-19', end: '2027-11-19' }]);
	assert.deepEqual(yearlyOccurrences('2026-11-19', '2026-11-19', 2025), [], 'not before its first year');
	assert.deepEqual(yearlyOccurrences('2024-02-29', '2024-02-29', 2026), [{ start: '2026-02-28', end: '2026-02-28' }]);
	assert.deepEqual(yearlyOccurrences('2025-12-30', '2026-01-02', 2027), [
		{ start: '2026-12-30', end: '2027-01-02' }, { start: '2027-12-30', end: '2028-01-02' },
	], 'a span across the new year: last year\'s reaches in, this year\'s reaches out');
});

test('the Umm al-Qura calendar, as the browser\'s own Intl gives it', () => {
	assert.deepEqual(toHijri('2026-02-18'), { year: 1447, month: 9, day: 1 });
	assert.deepEqual(toHijri('2026-03-20'), { year: 1447, month: 10, day: 1 });
	assert.deepEqual(toHijri('2027-05-16'), { year: 1448, month: 12, day: 10 });
});

test('an event every Hijri year lands on its Hijri days, a month\'s 30th on the 29th when the month has 29', () => {
	// Ramadan 1447 is 18 Feb to 19 Mar 2026 (30 days); Ramadan 1448 has 29: 8 Feb to 8 Mar 2027
	assert.deepEqual(hijriOccurrences('2026-02-18', '2026-03-19', 2026), [{ start: '2026-02-18', end: '2026-03-19' }]);
	assert.deepEqual(hijriOccurrences('2026-02-18', '2026-03-19', 2027), [{ start: '2027-02-08', end: '2027-03-08' }]);
	assert.deepEqual(hijriOccurrences('2026-03-20', '2026-03-22', 2027), [{ start: '2027-03-09', end: '2027-03-11' }], 'Eid al-Fitr');
	assert.deepEqual(hijriOccurrences('2026-03-20', '2026-03-22', 2025), [], 'not before its first year');
	// a Hijri year is 11 days shorter: in 2030 Ramadan starts in early January and again in late December, and the
	// second runs into 2031, a month of 29 days
	assert.deepEqual(hijriOccurrences('2026-02-18', '2026-03-19', 2030), [
		{ start: '2030-01-05', end: '2030-02-03' }, { start: '2030-12-26', end: '2031-01-23' },
	]);
	const y2031 = hijriOccurrences('2026-03-20', '2026-03-20', 2031);
	assert.deepEqual(y2031, [{ start: '2031-01-24', end: '2031-01-24' }]);
});

test('events that repeat are drawn in the year asked for, each occurrence its own item', () => {
	const ev = eventsFrom([
		note('Plans/Me.md', { start: '2026-11-19', repeat: 'yearly', category: 'Birthday' }),
		note('Plans/Ramadan.md', { start: '2026-02-18', end: '2026-03-19', repeat: 'yearly', calendar: 'hijri', category: 'Holiday' }),
		note('Plans/Once.md', { start: '2026-06-01' }),
	], es, at(2027));
	assert.deepEqual(ev.map((e) => [e.path, e.start, e.end]), [
		['Plans/Me.md', '2027-11-19', '2027-11-19'],
		['Plans/Ramadan.md', '2027-02-08', '2027-03-08'],
		['Plans/Once.md', '2026-06-01', '2026-06-01'],
	]);
	assert.notEqual(ev[0]?.id, 'Plans/Me.md', 'an occurrence is told apart from the note by its date');
	const words = ['annually', 'every year', 'Yearly'];
	for (const w of words) {
		assert.equal(eventsFrom([note('Plans/W.md', { start: '2026-01-05', repeat: w })], es, at(2028))[0]?.start, '2028-01-05', w);
	}
});

test('an event whose end is "today" runs until today: what is still waiting', () => {
	const ev = eventsFrom([note('Plans/Request.md', { start: '2026-03-15', end: 'today', category: 'Money' })], es, at(2026, '2026-10-01'));
	assert.deepEqual([ev[0]?.start, ev[0]?.end], ['2026-03-15', '2026-10-01']);
	const ongoing = eventsFrom([note('Plans/R.md', { start: '2026-08-24', end: 'Ongoing' })], es, at(2026, '2026-10-01'));
	assert.equal(ongoing[0]?.end, '2026-10-01');
});

test('a deadline inside an event is a mark of its own, in the Deadline kind, also when the event has no dates yet', () => {
	const ev = eventsFrom([
		note('Plans/ICRA 2027.md', { start: '2027-06-01', end: '2027-06-05', deadline: '2026-09-15', category: 'Conference' }),
		note('Plans/HRI 2027.md', { deadline: '2026-10-03', category: 'Conference' }),
	], es, at(2026));
	const marks = ev.filter((e) => e.milestone);
	assert.deepEqual(marks.map((e) => [e.path, e.start, e.end, e.title, e.milestone]), [
		['Plans/ICRA 2027.md', '2026-09-15', '2026-09-15', 'ICRA 2027 · deadline', 'deadline'],
		['Plans/HRI 2027.md', '2026-10-03', '2026-10-03', 'HRI 2027 · deadline', 'deadline'],
	]);
	assert.equal(marks[0]?.color, '#e03131');
	assert.equal(marks[0]?.icon, '⏰');
	assert.equal(ev.filter((e) => !e.milestone).length, 1, 'the conference itself, in its own year; the one with no dates draws only its mark');
});
