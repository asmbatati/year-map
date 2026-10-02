/* What the year map reads from notes: TaskNotes' tasks through TaskNotes' own settings, events with a start and an
 * end, and the daily notes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/settings-model.ts';
import { dailyNotes, dateOf, eventsFrom, journalDays, moveDate, tagsOf, taskSettingsFrom, tasksFrom, type NoteFacts } from '../src/sources.ts';

const note = (path: string, fm?: Record<string, unknown>, tags: string[] = []): NoteFacts => ({
	path,
	name: path.split('/').pop()?.replace(/\.md$/, '') ?? path,
	fm,
	tags,
});

test('a frontmatter date in its usual shapes', () => {
	assert.equal(dateOf('2026-10-03'), '2026-10-03');
	assert.equal(dateOf('2026-10-03T14:30'), '2026-10-03');
	assert.equal(dateOf('2026-10-03 14:30'), '2026-10-03');
	assert.equal(dateOf(new Date(Date.UTC(2026, 9, 3))), '2026-10-03');
	assert.equal(dateOf('3 Oct 2026'), null, 'not a date the year map guesses at');
	assert.equal(dateOf(''), null);
	assert.equal(dateOf(undefined), null);
	assert.equal(dateOf(['2026-10-03']), '2026-10-03', 'a one-item list');
});

test('TaskNotes settings: the tag, the fields and the colours, from the plugin itself', () => {
	const ts = taskSettingsFrom({
		taskTag: 'todo',
		taskIdentificationMethod: 'tag',
		fieldMapping: { due: 'deadline', scheduled: 'when', status: 'state', priority: 'prio', title: 'name', archiveTag: 'old' },
		customStatuses: [{ value: 'open', color: '#ff0000', isCompleted: false }, { value: 'closed', color: '#00ff00', isCompleted: true }],
		customPriorities: [{ value: 'high', color: '#ff0000' }],
	}, DEFAULT_SETTINGS);
	assert.equal(ts.tag, 'todo');
	assert.equal(ts.dueKey, 'deadline');
	assert.equal(ts.scheduledKey, 'when');
	assert.deepEqual(ts.completed, ['closed']);
	assert.equal(ts.statusColors.open, '#ff0000');
	assert.equal(ts.archiveTag, 'old');
	const none = taskSettingsFrom(undefined, DEFAULT_SETTINGS);
	assert.equal(none.tag, 'task', 'without TaskNotes, the defaults it ships with');
	assert.equal(none.dueKey, 'due');
});

test('tasks: a tagged note on its due day, coloured by status; done ones kept or hidden; archived never', () => {
	const ts = taskSettingsFrom(undefined, DEFAULT_SETTINGS);
	const notes = [
		note('t/a.md', { title: 'Write the paper', status: 'to-do', priority: 'high', due: '2026-10-05' }, ['task']),
		note('t/b.md', { status: 'done', due: '2026-10-01', scheduled: '2026-09-30' }, ['task']),
		note('t/c.md', { status: 'to-do', due: '2026-10-02' }, ['task', 'archived']),
		note('t/d.md', { status: 'to-do', due: '2026-10-02' }, ['idea']),
		note('t/e.md', { status: 'to-do', scheduled: '2026-10-07' }, ['task']),
	];
	const tasks = tasksFrom(notes, { ...ts, dateField: 'due', hideCompleted: false }, '2026-10-03');
	assert.deepEqual(tasks.map((t) => [t.path, t.iso, t.done]), [['t/a.md', '2026-10-05', false], ['t/b.md', '2026-10-01', true]]);
	assert.equal(tasks[0]?.title, 'Write the paper');
	assert.equal(tasks[0]?.color, ts.statusColors['to-do']);
	assert.equal(tasks[1]?.title, 'b', 'with no title, the note\'s name');
	const hidden = tasksFrom(notes, { ...ts, dateField: 'due', hideCompleted: true }, '2026-10-03');
	assert.deepEqual(hidden.map((t) => t.path), ['t/a.md']);
});

test('tasks: which date places them, and what is overdue', () => {
	const ts = taskSettingsFrom(undefined, DEFAULT_SETTINGS);
	const notes = [
		note('a.md', { status: 'to-do', due: '2026-10-09', scheduled: '2026-10-04' }, ['task']),
		note('b.md', { status: 'to-do', due: '2026-10-01' }, ['task']),
	];
	const sched = tasksFrom(notes, { ...ts, dateField: 'scheduled-or-due' }, '2026-10-03');
	assert.deepEqual(sched.map((t) => [t.path, t.iso, t.kind, t.overdue]),
		[['a.md', '2026-10-04', 'scheduled', false], ['b.md', '2026-10-01', 'due', true]]);
	const both = tasksFrom(notes, { ...ts, dateField: 'both' }, '2026-10-03');
	assert.equal(both.length, 3, 'a task with both dates shows on each');
});

test('tasks identified by a property instead of a tag', () => {
	const ts = taskSettingsFrom({ taskIdentificationMethod: 'property', taskPropertyName: 'kind', taskPropertyValue: 'task' }, DEFAULT_SETTINGS);
	const tasks = tasksFrom([note('a.md', { kind: 'task', due: '2026-01-02' }), note('b.md', { due: '2026-01-02' }, ['task'])], ts, '2026-01-01');
	assert.deepEqual(tasks.map((t) => t.path), ['a.md']);
});

test('events: a start and an end in the folders or tags the settings name; one date is a one-day event', () => {
	const es = { ...DEFAULT_SETTINGS.events, folders: ['Trips'], tags: ['event'] };
	const ev = eventsFrom([
		note('Trips/Lisbon.md', { title: 'Lisbon', start: '2026-07-03', end: '2026-07-07', color: '#e8590c' }),
		note('Notes/Talk.md', { date: '2026-03-02' }, ['event']),
		note('Notes/Other.md', { start: '2026-03-02' }),
		note('Trips/Undated.md', { title: 'Someday' }),
		note('Trips/FullCalendar.md', { title: 'Conference', date: '2026-05-20', endDate: '2026-05-22', allDay: true }),
	], es);
	assert.deepEqual(ev.map((e) => [e.path, e.start, e.end]), [
		['Trips/Lisbon.md', '2026-07-03', '2026-07-07'],
		['Notes/Talk.md', '2026-03-02', '2026-03-02'],
		['Trips/FullCalendar.md', '2026-05-20', '2026-05-22'],
	]);
	assert.equal(ev[0]?.color, '#e8590c');
	assert.equal(ev[1]?.title, 'Talk');
	assert.equal(ev[1]?.color, es.defaultColor);
});

test('daily notes: the notes in the folder whose names parse as dates, by date', () => {
	const parse = (name: string): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(name) ? name : null);
	const days = dailyNotes([
		{ path: 'Daily/2026-10-01.md', name: '2026-10-01' },
		{ path: 'Daily/notes about days.md', name: 'notes about days' },
		{ path: 'Elsewhere/2026-10-02.md', name: '2026-10-02' },
		{ path: 'Daily/sub/2026-10-03.md', name: '2026-10-03' },
	], 'Daily', parse);
	assert.deepEqual([...days.entries()], [['2026-10-01', 'Daily/2026-10-01.md'], ['2026-10-03', 'Daily/sub/2026-10-03.md']]);
});

test('a note\'s tags from its frontmatter: a list or a string, with or without the hash', () => {
	assert.deepEqual(tagsOf({ tags: ['task', '#Work/Paper'] }), ['task', 'work/paper']);
	assert.deepEqual(tagsOf({ tags: 'task, event' }), ['task', 'event']);
	assert.deepEqual(tagsOf({ tags: '#task #event' }), ['task', 'event']);
	assert.deepEqual(tagsOf({ tag: 'event' }), ['event'], 'the singular key too');
	assert.deepEqual(tagsOf(undefined), []);
	assert.deepEqual(tagsOf({ tags: [null, 3, ''] }), [], 'nothing that is not a tag');
});

test('the days a Journals journal has written, from the date it records in each note', () => {
	const notes = [
		note('Daily/26-Oct-01 (Thu).md', { journal: 'Daily', 'journal-date': '2026-10-01' }),
		note('Daily/26-Oct-02 (Fri).md', { journal: 'Daily', 'journal-date': '2026-10-02' }),
		note('Weekly/2026-W40.md', { journal: 'Weekly', 'journal-date': '2026-09-27' }),
		note('Daily/stray.md', { journal: 'Daily' }),
	];
	const days = journalDays(notes, 'Daily');
	assert.deepEqual([...days.entries()], [
		['2026-10-01', 'Daily/26-Oct-01 (Thu).md'],
		['2026-10-02', 'Daily/26-Oct-02 (Fri).md'],
	]);
	assert.equal(journalDays(notes, 'daily').size, 2, 'the journal\'s name in any case');
});

test('a date moved to another day keeps its time of day', () => {
	assert.equal(moveDate('2026-10-05T14:00', '2026-10-09'), '2026-10-09T14:00');
	assert.equal(moveDate('2026-10-05 09:30', '2026-10-09'), '2026-10-09 09:30');
	assert.equal(moveDate('2026-10-05', '2026-10-09'), '2026-10-09');
	assert.equal(moveDate(undefined, '2026-10-09'), '2026-10-09');
	assert.equal(moveDate('soon', '2026-10-09'), '2026-10-09');
});
