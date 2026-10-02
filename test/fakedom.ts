/* The part of Obsidian's DOM helpers the renderer uses (`createDiv`, `createEl`, `setText`, `setAttr`, `setCssProps`,
 * classes and events), in memory. */

export interface Info {
	cls?: string | string[];
	text?: string;
	href?: string;
	attr?: Record<string, string>;
}

export interface FakeEvent {
	type: string;
	defaultPrevented: boolean;
	preventDefault(): void;
	stopPropagation?(): void;
	propagationStopped?: boolean;
	ctrlKey?: boolean;
	button?: number;
	buttons?: number;
	dataTransfer?: { data: Map<string, string>; setData(k: string, v: string): void; getData(k: string): string; effectAllowed?: string; dropEffect?: string };
}

/** A drag's dataTransfer, kept in a map. */
export function fakeTransfer(): NonNullable<FakeEvent['dataTransfer']> {
	const data = new Map<string, string>();
	return { data, setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '' };
}

export class FakeEl {
	tag: string;
	classes = new Set<string>();
	attrs = new Map<string, string>();
	text = '';
	children: FakeEl[] = [];
	parent: FakeEl | null = null;
	listeners = new Map<string, ((e: FakeEvent) => void)[]>();
	css = new Map<string, string>();
	draggable = false;

	constructor(tag = 'div') {
		this.tag = tag;
	}

	createEl(tag: string, o: Info = {}): FakeEl {
		const el = new FakeEl(tag);
		el.parent = this;
		const cls = Array.isArray(o.cls) ? o.cls : (o.cls ?? '').split(/\s+/);
		for (const c of cls) if (c) el.classes.add(c);
		if (o.text !== undefined) el.text = o.text;
		if (o.href !== undefined) el.attrs.set('href', o.href);
		for (const [k, v] of Object.entries(o.attr ?? {})) el.attrs.set(k, v);
		this.children.push(el);
		return el;
	}

	createDiv(o: Info = {}): FakeEl {
		return this.createEl('div', o);
	}

	createSpan(o: Info = {}): FakeEl {
		return this.createEl('span', o);
	}

	focused = false;

	focus(): void {
		this.focused = true;
	}

	setText(t: string): void {
		this.text = t;
	}

	setAttr(k: string, v: string): void {
		this.attrs.set(k, v);
	}

	getAttr(k: string): string | null {
		return this.attrs.get(k) ?? null;
	}

	addClass(...cs: string[]): void {
		for (const c of cs) this.classes.add(c);
	}

	removeClass(...cs: string[]): void {
		for (const c of cs) this.classes.delete(c);
	}

	toggleClass(c: string, on: boolean): void {
		if (on) this.classes.add(c);
		else this.classes.delete(c);
	}

	setCssProps(props: Record<string, string>): void {
		for (const [k, v] of Object.entries(props)) this.css.set(k, v);
	}

	hasClass(c: string): boolean {
		return this.classes.has(c);
	}

	empty(): void {
		this.children = [];
	}

	addEventListener(type: string, fn: (e: FakeEvent) => void): void {
		const list = this.listeners.get(type) ?? [];
		list.push(fn);
		this.listeners.set(type, list);
	}

	fire(type: string, extra: Partial<FakeEvent> = {}): FakeEvent {
		const e: FakeEvent = {
			type,
			defaultPrevented: false,
			preventDefault() {
				this.defaultPrevented = true;
			},
			stopPropagation() {
				this.propagationStopped = true;
			},
			...extra,
		};
		for (const fn of this.listeners.get(type) ?? []) fn(e);
		return e;
	}

	/** An event as the browser sends it: here first, then up through the parents until one stops it. */
	dispatch(type: string, extra: Partial<FakeEvent> = {}): FakeEvent {
		const e = this.fire(type, extra);
		for (let at = this.parent; at && !e.propagationStopped; at = at.parent) {
			for (const fn of at.listeners.get(type) ?? []) fn(e);
		}
		return e;
	}

	get textContent(): string {
		return this.text + this.children.map((c) => c.textContent).join('');
	}

	/** The first descendant with this attribute value, depth first. */
	find(attr: string, value: string): FakeEl | null {
		for (const c of this.children) {
			if (c.attrs.get(attr) === value) return c;
			const hit = c.find(attr, value);
			if (hit) return hit;
		}
		return null;
	}

	all(cls: string): FakeEl[] {
		const out: FakeEl[] = [];
		const walk = (el: FakeEl): void => {
			for (const c of el.children) {
				if (c.classes.has(cls)) out.push(c);
				walk(c);
			}
		};
		walk(this);
		return out;
	}
}

export const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
