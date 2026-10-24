/* A stub of the `obsidian` module and an app with a vault in memory: enough to load the bundled plugin in Node.
 * TaskNotes, Journals and core Daily notes are stood in for by objects with the calls the year map makes. */
import { FakeEl } from './fakedom.ts';

export class TAbstractFile {
	path: string;
	constructor(path: string) {
		this.path = path;
	}
}

export class TFile extends TAbstractFile {
	basename: string;
	extension: string;
	constructor(path: string) {
		super(path);
		const name = path.split('/').pop() ?? path;
		this.extension = name.includes('.') ? (name.split('.').pop() ?? '') : '';
		this.basename = this.extension ? name.slice(0, -(this.extension.length + 1)) : name;
	}
}

export class TFolder extends TAbstractFile {}

class Component {
	children: Component[] = [];
	private cleanups: (() => void)[] = [];
	load(): void {
		this.onload();
	}
	unload(): void {
		for (const c of this.children) c.unload();
		for (const fn of this.cleanups) fn();
		this.onunload();
	}
	onload(): void {}
	onunload(): void {}
	addChild<T extends Component>(c: T): T {
		this.children.push(c);
		c.load();
		return c;
	}
	register(fn: () => void): void {
		this.cleanups.push(fn);
	}
	registerEvent(ref: { off: () => void }): void {
		this.cleanups.push(ref.off);
	}
	registerDomEvent(): void {}
	registerInterval(id: number): number {
		return id;
	}
}

export class MarkdownRenderChild extends Component {
	containerEl: FakeEl;
	constructor(containerEl: FakeEl) {
		super();
		this.containerEl = containerEl;
	}
}

export class WorkspaceLeaf {
	view: unknown = null;
	viewState: { type: string; active?: boolean; state?: unknown } | null = null;
	async setViewState(s: { type: string; active?: boolean; state?: unknown }): Promise<void> {
		this.viewState = s;
		const factory = views.get(s.type);
		if (factory) {
			const v = factory(this) as { onOpen?: () => Promise<void>; setState?: (st: unknown, r: unknown) => Promise<void> };
			this.view = v;
			if (s.state && v.setState) await v.setState(s.state, {});
			if (v.onOpen) await v.onOpen();
		}
	}
}

export const views = new Map<string, (leaf: WorkspaceLeaf) => unknown>();

export class ItemView extends Component {
	leaf: WorkspaceLeaf;
	app: FakeApp;
	containerEl = new FakeEl();
	contentEl: FakeEl;
	constructor(leaf: WorkspaceLeaf) {
		super();
		this.leaf = leaf;
		this.app = currentApp as FakeApp;
		this.containerEl.createDiv();
		this.contentEl = this.containerEl.createDiv({ cls: 'view-content' });
	}
	getState(): Record<string, unknown> {
		return {};
	}
	async setState(_s: unknown, _r: unknown): Promise<void> {}
}

let currentApp: FakeApp | null = null;

export const modals: unknown[] = [];
export class Modal {
	app: unknown;
	contentEl = new FakeEl();
	titleEl = new FakeEl();
	constructor(app: unknown) {
		this.app = app;
	}
	open(): void {
		modals.push(this);
		(this as unknown as { onOpen?: () => void }).onOpen?.();
	}
	close(): void {
		(this as unknown as { onClose?: () => void }).onClose?.();
	}
}

/** A text box, a toggle or a button: accepts any chain of calls. */
function component(): unknown {
	const inputEl = new FakeEl('input');
	const proxy: unknown = new Proxy({}, {
		get: (_t, prop) => {
			if (prop === 'then') return undefined;
			if (prop === 'inputEl' || prop === 'buttonEl' || prop === 'selectEl') return inputEl;
			return () => proxy;
		},
	});
	return proxy;
}

export const settingNames: string[] = [];

export class Setting {
	constructor(_containerEl: unknown) {
		const proxy: unknown = new Proxy({}, {
			get: (_t, prop) => {
				if (prop === 'then') return undefined;
				if (prop === 'settingEl' || prop === 'controlEl' || prop === 'nameEl' || prop === 'descEl') return new FakeEl();
				return (...args: unknown[]) => {
					if (prop === 'setName') settingNames.push(String(args[0]));
					if (typeof prop === 'string' && prop.startsWith('add') && typeof args[0] === 'function') {
						(args[0] as (c: unknown) => void)(component());
					}
					return proxy;
				};
			},
		});
		return proxy as Setting;
	}
}

export class PluginSettingTab {
	app: unknown;
	containerEl = new FakeEl();
	updates = 0;
	constructor(app: unknown) {
		this.app = app;
	}
	update(): void {
		this.updates++;
	}
}

export interface FakeMenuItem {
	title: string;
	icon: string;
	click: () => unknown;
}

/** Every menu shown, newest last, with its items in order. */
export const menus: { items: FakeMenuItem[]; at: unknown }[] = [];

export class Menu {
	items: FakeMenuItem[] = [];
	addItem(build: (item: unknown) => void): this {
		const it: FakeMenuItem = { title: '', icon: '', click: () => undefined };
		const api: Record<string, (...a: unknown[]) => unknown> = {
			setTitle: (t) => { it.title = String(t); return api; },
			setIcon: (i) => { it.icon = String(i); return api; },
			setSection: () => api,
			onClick: (fn) => { it.click = () => (fn as (evt?: unknown) => unknown)(); return api; },
		};
		build(api);
		this.items.push(it);
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtMouseEvent(evt: unknown): this {
		menus.push({ items: this.items, at: evt });
		return this;
	}
	showAtPosition(pos: unknown): this {
		menus.push({ items: this.items, at: pos });
		return this;
	}
}

export const notices: string[] = [];
export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export class Plugin extends Component {
	app: FakeApp;
	manifest: { id: string };
	data: unknown = null;
	processors = new Map<string, (source: string, el: FakeEl, ctx: unknown) => void>();
	commands: { id: string; name: string; callback?: () => void; editorCallback?: (editor: unknown) => void }[] = [];
	ribbons: { icon: string; title: string; cb: () => void }[] = [];
	hoverSources = new Map<string, unknown>();
	settingTabs: unknown[] = [];
	constructor(app: FakeApp, manifest: { id: string }) {
		super();
		this.app = app;
		this.manifest = manifest;
		currentApp = app;
	}
	loadData(): Promise<unknown> {
		return Promise.resolve(this.data);
	}
	saveData(d: unknown): Promise<void> {
		this.data = JSON.parse(JSON.stringify(d));
		return Promise.resolve();
	}
	registerMarkdownCodeBlockProcessor(lang: string, fn: (source: string, el: FakeEl, ctx: unknown) => void): void {
		this.processors.set(lang, fn);
	}
	registerHoverLinkSource(id: string, info: unknown): void {
		this.hoverSources.set(id, info);
	}
	registerView(type: string, factory: (leaf: WorkspaceLeaf) => unknown): void {
		views.set(type, factory);
	}
	addCommand(cmd: { id: string; name: string }): void {
		this.commands.push(cmd);
	}
	addRibbonIcon(icon: string, title: string, cb: () => void): FakeEl {
		this.ribbons.push({ icon, title, cb });
		return new FakeEl();
	}
	addSettingTab(tab: unknown): void {
		this.settingTabs.push(tab);
	}
}

export const Keymap = {
	isModEvent: (evt?: { ctrlKey?: boolean }): string | boolean => (evt?.ctrlKey ? 'tab' : false),
};

export function debounce<T extends unknown[]>(fn: (...a: T) => void, wait: number): ((...a: T) => void) & { cancel(): void } {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const d = (...a: T): void => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => fn(...a), wait);
	};
	d.cancel = (): void => {
		if (timer) clearTimeout(timer);
	};
	return d;
}

export const normalizePath = (p: string): string => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');

/** Enough of moment for the formats the tests use: YYYY-MM-DD, and `D MMMM YYYY` out. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function moment(input?: unknown, format?: string, strict?: boolean): {
	isValid(): boolean;
	format(f?: string): string;
	year(): number;
} {
	const s = typeof input === 'string' ? input : '2026-10-01';
	const ok = (format === undefined || format === 'YYYY-MM-DD') && /^\d{4}-\d{2}-\d{2}$/.test(s) && (strict === undefined || strict);
	return {
		isValid: () => ok,
		format: (f?: string) => {
			if (!f || f === 'YYYY-MM-DD') return s;
			if (f === 'D MMMM YYYY') return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
			if (f === 'YYYY') return s.slice(0, 4);
			return s;
		},
		year: () => Number(s.slice(0, 4)),
	};
}
moment.localeData = () => ({
	monthsShort: () => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
	weekdaysMin: () => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
});

type Handler = (...args: unknown[]) => void;

class Events {
	handlers = new Map<string, Handler[]>();
	on(name: string, fn: Handler): { off: () => void } {
		const list = this.handlers.get(name) ?? [];
		list.push(fn);
		this.handlers.set(name, list);
		return { off: () => this.handlers.set(name, (this.handlers.get(name) ?? []).filter((h) => h !== fn)) };
	}
	trigger(name: string, ...args: unknown[]): void {
		for (const fn of this.handlers.get(name) ?? []) fn(...args);
	}
}

export interface FakeNote {
	path: string;
	fm?: Record<string, unknown>;
	text?: string;
}

export class FakeApp {
	files = new Map<string, TFile>();
	folders = new Set<string>();
	fms = new Map<string, Record<string, unknown> | undefined>();
	texts = new Map<string, string>();
	opened: { target: string; newLeaf: unknown }[] = [];
	leaves: WorkspaceLeaf[] = [];
	vault: Events & Record<string, unknown>;
	metadataCache: Events & Record<string, unknown>;
	workspace: Events & Record<string, unknown>;
	fileManager: Record<string, unknown>;
	plugins: { plugins: Record<string, unknown>; getPlugin(id: string): unknown };
	internalPlugins: { getPluginById(id: string): unknown };
	internal: Record<string, unknown> = {};

	constructor(notes: FakeNote[]) {
		for (const n of notes) this.put(n);
		const vault = new Events() as Events & Record<string, unknown>;
		vault.getMarkdownFiles = () => [...this.files.values()].filter((f) => f.extension === 'md');
		vault.getAbstractFileByPath = (p: string) => this.files.get(p) ?? (this.folders.has(p) ? new TFolder(p) : null);
		vault.cachedRead = (f: TFile) => Promise.resolve(this.texts.get(f.path) ?? '');
		vault.read = vault.cachedRead;
		vault.createFolder = (p: string) => {
			this.folders.add(p);
			return Promise.resolve();
		};
		vault.create = (p: string, text: string) => {
			if (this.files.has(p)) return Promise.reject(new Error('File already exists.'));
			const f = this.put({ path: p, text, fm: frontmatterOf(text) });
			vault.trigger('create', f);
			return Promise.resolve(f);
		};
		this.vault = vault;
		const mc = new Events() as Events & Record<string, unknown>;
		mc.getFileCache = (f: TFile) => {
			const fm = this.fms.get(f.path);
			return fm === undefined ? {} : { frontmatter: fm };
		};
		this.metadataCache = mc;
		const ws = new Events() as Events & Record<string, unknown>;
		ws.onLayoutReady = (cb: () => void) => cb();
		ws.openLinkText = (target: string, _source: string, newLeaf: unknown) => {
			this.opened.push({ target, newLeaf });
			return Promise.resolve();
		};
		ws.getLeavesOfType = (type: string) => this.leaves.filter((l) => l.viewState?.type === type);
		ws.getLeaf = () => {
			const l = new WorkspaceLeaf();
			this.leaves.push(l);
			return l;
		};
		ws.revealLeaf = () => Promise.resolve();
		ws.requestSaveLayout = () => {};
		this.workspace = ws;
		this.fileManager = {
			processFrontMatter: (f: TFile, fn: (fm: Record<string, unknown>) => void) => {
				const fm = { ...(this.fms.get(f.path) ?? {}) };
				fn(fm);
				this.fms.set(f.path, fm);
				return Promise.resolve();
			},
			renameFile: (f: TFile, to: string) => {
				if (this.files.has(to)) return Promise.reject(new Error('Destination file already exists!'));
				const from = f.path;
				const moved = this.put({ path: to, fm: this.fms.get(from), text: this.texts.get(from) });
				this.files.delete(from);
				this.fms.delete(from);
				this.texts.delete(from);
				vault.trigger('rename', moved, from);
				return Promise.resolve();
			},
		};
		this.plugins = { plugins: {}, getPlugin: (id: string) => this.plugins.plugins[id] ?? null };
		this.internalPlugins = { getPluginById: (id: string) => this.internal[id] ?? null };
	}

	/** A note written or changed, as Obsidian reports it once it has read the note again. */
	change(n: FakeNote): TFile {
		const f = this.put(n);
		this.metadataCache.trigger('changed', f, n.text ?? '', { frontmatter: n.fm });
		return f;
	}

	put(n: FakeNote): TFile {
		const f = this.files.get(n.path) ?? new TFile(n.path);
		this.files.set(n.path, f);
		this.fms.set(n.path, n.fm);
		if (n.text !== undefined) this.texts.set(n.path, n.text);
		return f;
	}
}

/** The frontmatter of a written note, read back the simple way the tests need: `key: value` lines. */
function frontmatterOf(text: string): Record<string, unknown> | undefined {
	const m = /^---\n([\s\S]*?)\n---/.exec(text);
	if (!m?.[1]) return undefined;
	const out: Record<string, unknown> = {};
	for (const line of m[1].split('\n')) {
		const kv = /^([\w-]+):\s*(.*)$/.exec(line);
		if (kv?.[1]) out[kv[1]] = (kv[2] ?? '').replace(/^"|"$/g, '');
	}
	return out;
}

/** The module the bundle asks for with `require("obsidian")`. */
export const obsidianStub = {
	Plugin,
	PluginSettingTab,
	Setting,
	Notice,
	Modal,
	Menu,
	ItemView,
	WorkspaceLeaf,
	MarkdownRenderChild,
	TAbstractFile,
	TFile,
	TFolder,
	Keymap,
	debounce,
	normalizePath,
	moment,
};
