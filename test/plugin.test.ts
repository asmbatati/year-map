/*
 * The plugin end to end: bundled as Obsidian would load it, with the `obsidian` module stubbed, a vault in memory, and
 * TaskNotes and Journals stood in for by objects with the calls the year map makes of them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { FakeApp, menus, modals, notices, obsidianStub, settingNames, type FakeNote } from './fakeobsidian.ts';
import { FakeEl, fakeTransfer } from './fakedom.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(here + '.build', { recursive: true });
esbuild.buildSync({
	entryPoints: [here + '../src/main.ts'],
	bundle: true,
	format: 'cjs',
	target: 'es2021',
	external: ['obsidian'],
	outfile: here + '.build/main.cjs',
	logLevel: 'error',
});

type Loader = (request: string, ...rest: unknown[]) => unknown;
const mod = Module as unknown as { _load: Loader };
const load = mod._load;
mod._load = function (request: string, ...rest: unknown[]): unknown {
	if (request === 'obsidian') return obsidianStub;
	return load.call(this, request, ...rest);
};
const require = createRequire(import.meta.url);
const PluginClass = (require('./.build/main.cjs') as { default: new (app: FakeApp, manifest: { id: string }) => TestPlugin }).default;

interface TestPlugin {
	onload(): Promise<void>;
	onunload(): void;
	settings: Record<string, unknown> & { events: Record<string, unknown>; tasks: Record<string, unknown>; days: Record<string, unknown> };
	data: unknown;
	processors: Map<string, (source: string, el: FakeEl, ctx: unknown) => void>;
	commands: { id: string; name: string; callback?: () => unknown; editorCallback?: (editor: unknown) => void }[];
	ribbons: { icon: string; title: string; cb: () => void }[];
	settingTabs: SettingsTab[];
	saveSettings(): Promise<void>;
}

interface Definition {
	name?: string;
	heading?: string;
	type?: string;
	items?: Definition[];
	control?: { type: string; key: string; options?: Record<string, string> };
	render?: (setting: unknown) => void;
}

interface SettingsTab {
	getSettingDefinitions(): Definition[];
	getControlValue(key: string): unknown;
	setControlValue(key: string, value: unknown): Promise<void>;
}

const vaultNotes: FakeNote[] = [
	{ path: 'Tasks/Submit the paper.md', fm: { title: 'Submit the paper', status: 'open', deadline: '2026-10-05', tags: ['task'] } },
	{ path: 'Tasks/Read Sutton.md', fm: { status: 'open', scheduled: '2026-10-07', tags: ['task'] } },
	{ path: 'Tasks/Old.md', fm: { status: 'done', deadline: '2026-10-05', tags: ['task', 'archived'] } },
	{ path: 'Daily/26-Oct-01 (Thu).md', fm: { journal: 'Daily', 'journal-date': '2026-10-01' } },
	{ path: 'Year Map/Lisbon.md', fm: { start: '2026-07-30', end: '2026-08-02', color: '#1c7ed6' } },
	{ path: 'Notes/Plain.md', fm: { up: '[[HOME]]' } },
];

interface Calls {
	journals: unknown[][];
	tasknotes: unknown[][];
}

function tasknotes(calls: Calls): unknown {
	return {
		settings: {
			taskTag: 'task',
			taskIdentificationMethod: 'tag',
			fieldMapping: { due: 'deadline', scheduled: 'scheduled', status: 'status', priority: 'priority', title: 'title', archiveTag: 'archived' },
			customStatuses: [{ value: 'open', color: '#123456', isCompleted: false }, { value: 'done', color: '#00aa00', isCompleted: true }],
			customPriorities: [],
		},
		cacheManager: { getTaskInfo: (path: string) => Promise.resolve({ path, info: true }) },
		updateTaskProperty: (task: { path: string }, property: string, value: string) => {
			calls.tasknotes.push([task.path, property, value]);
			return Promise.resolve(task);
		},
	};
}

function journals(calls: Calls): unknown {
	return {
		getJournal: (name: string) => (['Daily', 'Monthly', 'Annually'].includes(name)
			? {
				get: (iso: string) => ({ date: iso }),
				open: (note: { date: string }, mode: unknown) => {
					calls.journals.push([name, note.date, mode]);
					return Promise.resolve();
				},
			}
			: undefined),
	};
}

async function setup(opts: { tasknotes?: boolean; journals?: boolean; saved?: unknown } = {}) {
	const app = new FakeApp(vaultNotes.map((n) => ({ ...n, fm: n.fm ? { ...n.fm } : undefined })));
	const calls: Calls = { journals: [], tasknotes: [] };
	if (opts.tasknotes !== false) app.plugins.plugins.tasknotes = tasknotes(calls);
	if (opts.journals !== false) app.plugins.plugins.journals = journals(calls);
	const plugin = new PluginClass(app, { id: 'year-map' });
	plugin.data = opts.saved ?? null;
	await plugin.onload();
	const block = (source = '', sourcePath = 'Notes/Plain.md'): FakeEl => {
		const el = new FakeEl();
		const process = plugin.processors.get('year-map');
		assert.ok(process, 'the block is registered');
		process(source, el, { sourcePath, addChild: (c: { load(): void }) => c.load() });
		return el;
	};
	return { app, plugin, block, calls };
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const day = (el: FakeEl, iso: string): FakeEl => {
	const d = el.find('data-iso', iso);
	assert.ok(d, iso);
	return d;
};

test('loading registers the block, the view, the ribbon icon, the commands and the settings tab', async () => {
	const { plugin } = await setup();
	assert.ok(plugin.processors.has('year-map'));
	assert.deepEqual(plugin.commands.map((c) => c.id), ['open', 'insert-block']);
	assert.equal(plugin.ribbons.length, 1);
	assert.equal(plugin.settingTabs.length, 1);
});

test('a block draws this year with TaskNotes\' tasks, through its own field names and colours, and the journal\'s days', async () => {
	const { block } = await setup();
	const el = block('year: 2026');
	assert.equal(el.all('ym-title')[0]?.text, '2026 Linear Calendar');
	const chips = day(el, '2026-10-05').all('ym-task');
	assert.deepEqual(chips.map((c) => c.attrs.get('data-path')), ['Tasks/Submit the paper.md'], 'the archived one is left out');
	assert.equal(chips[0]?.css.get('--ym-color'), '#123456', 'the status colour TaskNotes gives it');
	assert.equal(day(el, '2026-10-07').all('ym-task').length, 1, 'a scheduled task on its scheduled day');
	assert.ok(day(el, '2026-10-01').hasClass('has-note'), 'the day the Daily journal wrote');
	assert.equal(el.all('ym-bar').length, 2, 'the trip, across July and August');
});

test('a block can choose its year, title, density and layers', async () => {
	const { block } = await setup();
	const el = block('year: 2027\ntitle: The thesis year\ndensity: compact\nlayers: events');
	assert.equal(el.all('ym-title')[0]?.text, 'The thesis year');
	assert.ok(el.all('ym')[0]?.hasClass('ym-compact'));
	assert.equal(el.all('ym-task').length, 0);
	assert.ok(el.find('data-iso', '2027-01-01'));
	const relative = block('year: next\ntitle: {year}');
	assert.equal(relative.all('ym-title')[0]?.text, '2027', 'next year, from today in 2026');
});

test('a day opens through Journals, a month through the monthly journal, the title through the yearly one', async () => {
	const { block, calls } = await setup({ saved: { dayClick: 'note' } });
	const el = block('year: 2026');
	day(el, '2026-03-14').fire('click');
	day(el, '2026-03-15').fire('click', { ctrlKey: true });
	el.all('ym-mlabel')[2]?.fire('click');
	el.all('ym-title')[0]?.fire('click');
	await wait(10);
	assert.deepEqual(calls.journals, [
		['Daily', '2026-03-14', false],
		['Daily', '2026-03-15', 'tab'],
		['Monthly', '2026-02-01', false],
		['Annually', '2026-01-01', false],
	]);
});

test('without Journals, a day opens the core daily note, made from its template when it does not exist yet', async () => {
	const { app, block } = await setup({ journals: false, saved: { dayClick: 'note' } });
	app.internal['daily-notes'] = { enabled: true, instance: { options: { folder: 'Days', format: 'YYYY-MM-DD', template: 'Templates/Day' } } };
	app.put({ path: 'Templates/Day.md', text: '# {{date}}\n' });
	app.put({ path: 'Days/2026-03-14.md', fm: {} });
	const el = block('year: 2026');
	day(el, '2026-03-14').fire('click');
	await wait(10);
	assert.deepEqual(app.opened.at(-1), { target: 'Days/2026-03-14.md', newLeaf: false });
	day(el, '2026-03-16').fire('click');
	await wait(10);
	assert.equal(app.texts.get('Days/2026-03-16.md'), '# 2026-03-16\n', 'the template, with its date filled in');
	assert.deepEqual(app.opened.at(-1), { target: 'Days/2026-03-16.md', newLeaf: false });
	assert.ok(block('year: 2026').find('data-iso', '2026-03-14')?.hasClass('has-note'), 'its days are marked too');
});

test('a task dropped on another day is rescheduled through TaskNotes, or in its frontmatter without it', async () => {
	const { block, calls } = await setup();
	const el = block('year: 2026');
	const chip = day(el, '2026-10-05').all('ym-task')[0];
	assert.ok(chip);
	const dt = fakeTransfer();
	chip.fire('dragstart', { dataTransfer: dt });
	day(el, '2026-10-09').fire('dragover', { dataTransfer: dt });
	day(el, '2026-10-09').fire('drop', { dataTransfer: dt });
	await wait(10);
	assert.deepEqual(calls.tasknotes, [['Tasks/Submit the paper.md', 'due', '2026-10-09']]);

	const plain = await setup({ tasknotes: false });
	const el2 = plain.block('year: 2026');
	const chip2 = el2.find('data-iso', '2026-10-07')?.all('ym-task')[0];
	assert.ok(chip2);
	chip2.fire('dragstart', { dataTransfer: dt });
	el2.find('data-iso', '2026-10-12')?.fire('drop', { dataTransfer: dt });
	await wait(10);
	assert.equal(plain.app.fms.get('Tasks/Read Sutton.md')?.scheduled, '2026-10-12');
});

test('dragging across days plans an event: a note in the events folder, drawn as a bar once written', async () => {
	const { app, block } = await setup();
	const el = block('year: 2026');
	day(el, '2026-04-08').fire('pointerdown', { button: 0 });
	day(el, '2026-04-11').fire('pointerenter', { buttons: 1 });
	day(el, '2026-04-11').fire('pointerup');
	const modal = modals.at(-1) as { submit(title: string, color?: string): Promise<string | null> } | undefined;
	assert.ok(modal, 'the planning window opened');
	const path = await modal.submit('Umrah / trip?', '#2f9e44');
	assert.equal(path, 'Year Map/Umrah trip.md', 'a name a file can carry');
	assert.deepEqual(app.fms.get('Year Map/Umrah trip.md'), { title: 'Umrah / trip?', start: '2026-04-08', end: '2026-04-11', color: '#2f9e44' });
	await wait(400);
	const bars = el.all('ym-bar').map((b) => b.text);
	assert.ok(bars.includes('Umrah / trip?'), 'the block drew it after the vault said so');
	const again = await modal.submit('Umrah / trip?', '#2f9e44');
	assert.equal(again, 'Year Map/Umrah trip 2.md', 'a second plan of the same name does not overwrite the first');
});

test('a planned event takes the vault\'s own properties and body from the settings', async () => {
	const { app, block } = await setup({ saved: { events: {
		extraProperties: 'up: "[[Plans]]"\ncreated: {{now:YYYY-MM-DD}}',
		body: '```nav\n```\n\n# {{title}}\n',
	} } });
	const el = block('year: 2026');
	day(el, '2026-05-03').fire('pointerdown', { button: 0 });
	day(el, '2026-05-04').fire('pointerenter', { buttons: 1 });
	day(el, '2026-05-04').fire('pointerup');
	const modal = modals.at(-1) as { submit(title: string, color?: string): Promise<string | null> } | undefined;
	assert.ok(modal);
	const path = await modal.submit('Thesis week');
	assert.equal(path, 'Year Map/Thesis week.md');
	const fm = app.fms.get('Year Map/Thesis week.md');
	assert.equal(fm?.up, '[[Plans]]');
	assert.equal(fm?.created, '2026-10-01', 'the time it was planned, in the format asked for');
	assert.equal(fm?.start, '2026-05-03');
	assert.match(app.texts.get('Year Map/Thesis week.md') ?? '', /\n---\n```nav\n```\n\n# Thesis week\n$/);
});

test('the view opens from its command, and its buttons move through the years', async () => {
	const { app, plugin } = await setup();
	await plugin.commands.find((c) => c.id === 'open')?.callback?.();
	const leaf = app.leaves[0];
	assert.ok(leaf?.view, 'a leaf shows the view');
	const view = leaf.view as { contentEl: FakeEl; getState(): { year: number } };
	assert.equal(view.contentEl.all('ym-title')[0]?.text, '2026 Linear Calendar');
	view.contentEl.all('ym-next')[0]?.fire('click');
	assert.equal(view.contentEl.all('ym-title')[0]?.text, '2027 Linear Calendar');
	assert.equal(view.getState().year, 2027, 'the year is kept with the workspace');
	view.contentEl.all('ym-today')[0]?.fire('click');
	assert.equal(view.getState().year, 2026);
	await plugin.commands.find((c) => c.id === 'open')?.callback?.();
	assert.equal(app.leaves.length, 1, 'a second open shows the same leaf');
});

test('a new task appears on its day once the vault has read it', async () => {
	const { app, block } = await setup();
	const el = block('year: 2026');
	app.change({ path: 'Tasks/New.md', fm: { status: 'open', deadline: '2026-11-11', tags: ['task'] } });
	await wait(400);
	assert.equal(el.find('data-iso', '2026-11-11')?.all('ym-task').length, 1);
});

test('the command puts a block where the cursor is', async () => {
	const { plugin } = await setup();
	let inserted = '';
	plugin.commands.find((c) => c.id === 'insert-block')?.editorCallback?.({ replaceSelection: (s: string) => { inserted = s; } });
	assert.equal(inserted, '```year-map\n```\n');
});

test('the settings tab defines every setting, and each row draws', async () => {
	const { plugin } = await setup();
	const tab = plugin.settingTabs[0];
	assert.ok(tab);
	const flat: Definition[] = [];
	const walk = (items: Definition[]): void => {
		for (const d of items) {
			flat.push(d);
			if (d.items) walk(d.items);
		}
	};
	walk(tab.getSettingDefinitions());
	const names = flat.map((d) => d.name ?? d.heading);
	for (const name of ['Block name', 'Week starts on', 'Weekend', 'Title', 'Daily notes', 'Daily notes from', 'Tasks', 'Date a task sits on',
		'Drag to reschedule', 'Events', 'Event folders', 'Folder for new events', 'Properties for new events', 'Text of a new event']) {
		assert.ok(names.includes(name), name);
	}
	const before = settingNames.length;
	for (const d of flat) d.render?.(new obsidianStub.Setting(null));
	assert.equal(settingNames.length, before, 'rows draw into the Setting they are given');
	for (const d of flat) {
		if (d.control) assert.notEqual(tab.getControlValue(d.control.key), undefined, `${d.control.key} has a value`);
	}
});

test('a change in the settings is saved, read back, and drawn', async () => {
	const { plugin, block } = await setup();
	const tab = plugin.settingTabs[0];
	assert.ok(tab);
	await tab.setControlValue('weekendDays', '5,6');
	assert.deepEqual(plugin.settings.weekendDays, [5, 6]);
	assert.equal(tab.getControlValue('weekendDays'), '5,6');
	await tab.setControlValue('weekStart', '6');
	assert.equal(plugin.settings.weekStart, 6);
	await tab.setControlValue('events.folders', 'Year Map\nPlans/\n');
	assert.deepEqual(plugin.settings.events.folders, ['Year Map', 'Plans']);
	assert.equal(tab.getControlValue('events.folders'), 'Year Map\nPlans');
	await tab.setControlValue('tasks.completed', 'done, cancelled');
	assert.deepEqual(plugin.settings.tasks.completed, ['done', 'cancelled']);
	await tab.setControlValue('tasks.dragReschedule', false);
	assert.equal(plugin.settings.tasks.dragReschedule, false);
	await tab.setControlValue('blockName', '  ');
	assert.equal(plugin.settings.blockName, 'year-map', 'a block keeps a name');
	await tab.setControlValue('events.extraProperties', 'up: "[[Plans]]"\n');
	assert.equal(plugin.settings.events.extraProperties, 'up: "[[Plans]]"', 'kept as written, without the trailing line');
	await tab.setControlValue('maxChips', 0);
	assert.equal(plugin.settings.maxChips, 1, 'at least one');
	assert.deepEqual((plugin.data as { weekendDays: number[] }).weekendDays, [5, 6], 'saved');
	const el = block('year: 2026');
	assert.equal(el.all('ym-wd')[0]?.text, 'Sa', 'the week starts on Saturday now');
});

test('saved settings missing a newer field fall back to its default', async () => {
	const before = notices.length;
	const { plugin } = await setup({ saved: { title: 'My year', events: { folders: ['Plans'] } } });
	assert.equal(plugin.settings.title, 'My year');
	assert.deepEqual(plugin.settings.events.folders, ['Plans']);
	assert.deepEqual(plugin.settings.events.startKeys, ['start', 'date', 'startDate']);
	assert.equal(plugin.settings.tasks.dateField, 'scheduled-or-due');
	assert.equal(notices.length, before, 'nothing went wrong loading');
});

/* 1.1: a click on a day asks, an event has a kind, an icon and a repeat. */
interface EventWindow {
	submit(title: string, color?: string, extra?: Record<string, unknown>): Promise<string | null>;
}

test('a click on a day asks: add an event, add one every year, or open the day\'s note', async () => {
	const { app, block, calls } = await setup();
	const el = block('year: 2026');
	day(el, '2026-11-19').fire('click');
	const menu = menus.at(-1);
	assert.ok(menu, 'a menu');
	assert.deepEqual(menu.items.map((i) => i.title), ['Add an event on 19 Nov 2026', 'Add a yearly event on 19 Nov 2026', 'Open the day\'s note']);
	menu.items[2]?.click();
	await wait(10);
	assert.deepEqual(calls.journals.at(-1), ['Daily', '2026-11-19', false]);
	menu.items[1]?.click();
	const win = modals.at(-1) as EventWindow | undefined;
	assert.ok(win, 'the event window');
	const path = await win.submit('Me', undefined, { category: 'Birthday' });
	assert.equal(path, 'Year Map/Me.md');
	assert.deepEqual(app.fms.get('Year Map/Me.md'), { title: 'Me', start: '2026-11-19', category: 'Birthday', repeat: 'yearly' });
	await wait(400);
	const bar = el.all('ym-bar').find((b) => b.attrs.get('data-path') === 'Year Map/Me.md');
	assert.equal(bar?.text, '🎂', 'drawn with its kind\'s icon, a single day as the icon alone');
	assert.equal(bar?.attrs.get('title'), 'Me · 19 Nov 2026');
});

test('a day\'s menu names the events on it, to open', async () => {
	const { app, block } = await setup();
	const el = block('year: 2026');
	day(el, '2026-07-31').fire('contextmenu');
	const open = menus.at(-1)?.items.find((i) => i.title === 'Open Lisbon');
	assert.ok(open, 'the trip across the day');
	open.click();
	await wait(10);
	assert.deepEqual(app.opened.at(-1), { target: 'Year Map/Lisbon.md', newLeaf: false });
});

test('the click can open the note or add an event at once; a modified click and a right-click keep their ways', async () => {
	const note = await setup({ saved: { dayClick: 'note' } });
	const el = note.block('year: 2026');
	const before = menus.length;
	day(el, '2026-03-14').fire('click');
	await wait(10);
	assert.deepEqual(note.calls.journals.at(-1), ['Daily', '2026-03-14', false]);
	assert.equal(menus.length, before, 'no menu');
	day(el, '2026-03-14').fire('contextmenu');
	assert.equal(menus.length, before + 1, 'a right-click asks');

	const ev = await setup({ saved: { dayClick: 'event' } });
	const el2 = ev.block('year: 2026');
	const m0 = modals.length;
	day(el2, '2026-03-14').fire('click');
	assert.equal(modals.length, m0 + 1, 'the event window, at once');
	day(el2, '2026-03-15').fire('click', { ctrlKey: true });
	await wait(10);
	assert.deepEqual(ev.calls.journals.at(-1), ['Daily', '2026-03-15', 'tab'], 'a modified click opens the note in a new tab');
});

test('an event every Hijri year, with its own icon, is written as asked', async () => {
	const { app, block } = await setup();
	const el = block('year: 2026');
	day(el, '2026-02-18').fire('click');
	menus.at(-1)?.items[0]?.click();
	const win = modals.at(-1) as EventWindow | undefined;
	assert.ok(win);
	await win.submit('Ramadan', undefined, { end: '2026-03-19', category: 'Holiday', repeat: 'hijri', icon: '🌙' });
	assert.deepEqual(app.fms.get('Year Map/Ramadan.md'), {
		title: 'Ramadan', start: '2026-02-18', end: '2026-03-19', category: 'Holiday', icon: '🌙', repeat: 'yearly', calendar: 'hijri',
	});
});

test('the settings carry the click, the legend, the quarters and the kinds, which read back as written', async () => {
	const { plugin } = await setup();
	const tab = plugin.settingTabs[0];
	assert.ok(tab);
	const flat: Definition[] = [];
	const walk = (items: Definition[]): void => {
		for (const d of items) {
			flat.push(d);
			if (d.items) walk(d.items);
		}
	};
	walk(tab.getSettingDefinitions());
	const names = flat.map((d) => d.name ?? d.heading);
	for (const name of ['A click on a day', 'Legend', 'Tint each quarter', 'First quarter', 'Fourth quarter', 'Kinds of event',
		'Kind property', 'Icon property', 'Repeat property', 'Calendar property', 'Dates inside an event']) {
		assert.ok(names.includes(name), name);
	}
	assert.match(String(tab.getControlValue('events.categories')), /^Personal, #f08c00, 🌟\nEducation, #1971c2, 📚/);
	await tab.setControlValue('events.categories', 'Birthday, #ff00aa, 🎈\nnot a kind');
	assert.deepEqual(plugin.settings.events.categories, [{ name: 'Birthday', color: '#ff00aa', icon: '🎈' }]);
	await tab.setControlValue('quarters.colors.2', '#e0ffff');
	assert.equal((plugin.settings.quarters as { colors: string[] }).colors[2], '#e0ffff');
	await tab.setControlValue('events.milestoneKeys', 'deadline, notification');
	assert.deepEqual(plugin.settings.events.milestoneKeys, ['deadline', 'notification']);
	assert.equal(tab.getControlValue('dayClick'), 'menu');
});

/* 1.2: an event on the map can be changed where it is drawn. */
const bar = (el: FakeEl, path: string): FakeEl => {
	const b = el.all('ym-bar').find((x) => x.attrs.get('data-path') === path);
	assert.ok(b, path);
	return b;
};

test('a right-click on an event asks: open its note, or edit it; the edit writes what changed and renames the note', async () => {
	const { app, block } = await setup();
	const el = block('year: 2026');
	const e = bar(el, 'Year Map/Lisbon.md').fire('contextmenu');
	assert.ok(e.defaultPrevented, 'the browser\'s own menu is not shown');
	const menu = menus.at(-1);
	assert.deepEqual(menu?.items.map((i) => i.title), ['Open the note', 'Edit the event']);
	menu?.items[1]?.click();
	await wait(10);
	const win = modals.at(-1) as EventWindow | undefined;
	assert.ok(win, 'the event window, filled in');
	const path = await win.submit('Lisbon trip', undefined, { end: '2026-08-05', category: 'Trip', repeat: 'yearly' });
	assert.equal(path, 'Year Map/Lisbon trip.md');
	assert.equal(app.files.has('Year Map/Lisbon.md'), false);
	assert.deepEqual(app.fms.get('Year Map/Lisbon trip.md'), {
		start: '2026-07-30', end: '2026-08-05', color: '#1c7ed6', title: 'Lisbon trip', category: 'Trip', repeat: 'yearly',
	});
	menu?.items[0]?.click();
	await wait(10);
	assert.deepEqual(app.opened.at(-1), { target: 'Year Map/Lisbon.md', newLeaf: false });
});

test('an edit clears what was emptied and leaves an open end, a name and keys it was not asked to change', async () => {
	const { app, block } = await setup();
	app.change({ path: 'Year Map/Course.md', fm: { title: 'A course', date: '2026-09-01', end: 'today', icon: '📚', repeat: 'yearly', calendar: 'hijri' } });
	await wait(400);
	const el = block('year: 2026');
	bar(el, 'Year Map/Course.md').fire('contextmenu');
	menus.at(-1)?.items[1]?.click();
	await wait(10);
	const win = modals.at(-1) as EventWindow | undefined;
	assert.ok(win);
	const path = await win.submit('A course', '#2f9e44', { icon: undefined, repeat: 'never' });
	assert.equal(path, 'Year Map/Course.md', 'its name was not changed, so neither is its file');
	assert.deepEqual(app.fms.get('Year Map/Course.md'), { title: 'A course', date: '2026-09-01', end: 'today', color: '#2f9e44' });
});

test('a click on an event opens its note, or the edit, as the settings say; a day\'s menu offers the edit too', async () => {
	const plain = await setup();
	const el = plain.block('year: 2026');
	const m0 = modals.length;
	bar(el, 'Year Map/Lisbon.md').fire('click');
	await wait(10);
	assert.deepEqual(plain.app.opened.at(-1), { target: 'Year Map/Lisbon.md', newLeaf: false });
	assert.equal(modals.length, m0, 'no window');
	day(el, '2026-07-31').fire('contextmenu');
	assert.ok(menus.at(-1)?.items.some((i) => i.title === 'Edit Lisbon'), 'the day\'s menu names the edit');

	const edit = await setup({ saved: { eventClick: 'edit' } });
	const el2 = edit.block('year: 2026');
	bar(el2, 'Year Map/Lisbon.md').fire('click');
	await wait(10);
	assert.equal(modals.length, m0 + 1, 'the edit, at once');
	bar(el2, 'Year Map/Lisbon.md').fire('click', { ctrlKey: true });
	await wait(10);
	assert.deepEqual(edit.app.opened.at(-1), { target: 'Year Map/Lisbon.md', newLeaf: 'tab' }, 'a modified click opens the note');

	const ask = await setup({ saved: { eventClick: 'menu' } });
	const el3 = ask.block('year: 2026');
	bar(el3, 'Year Map/Lisbon.md').fire('click');
	assert.deepEqual(menus.at(-1)?.items.map((i) => i.title), ['Open the note', 'Edit the event']);
	assert.equal(ask.plugin.settingTabs[0]?.getControlValue('eventClick'), 'menu');
});
