/* What a `year-map` code block may say, one `name: value` per line: the year (a number, or this, next, last, +N,
 * -N), the title, the density and the layers. What it does not understand it ignores, so a block never breaks. Pure. */
export type Layer = 'days' | 'tasks' | 'events';

export interface BlockOptions {
	year?: number;
	yearOffset?: number;
	title?: string;
	density?: 'comfortable' | 'compact';
	layers?: Layer[];
}

const LAYERS: readonly Layer[] = ['days', 'tasks', 'events'];
const RELATIVE: Record<string, number> = { this: 0, next: 1, last: -1, previous: -1 };

export function parseBlockOptions(source: string): BlockOptions {
	const out: BlockOptions = {};
	for (const raw of source.split(/\r?\n/)) {
		const m = /^\s*([A-Za-z]+)\s*:\s*(.*?)\s*$/.exec(raw);
		if (!m?.[1]) continue;
		const name = m[1].toLowerCase();
		const value = m[2] ?? '';
		if (name === 'year') {
			const v = value.toLowerCase();
			if (/^\d{4}$/.test(v)) out.year = Number(v);
			else if (/^[+-]\d{1,3}$/.test(v)) out.yearOffset = Number(v);
			else if (v in RELATIVE) out.yearOffset = RELATIVE[v];
		} else if (name === 'title' && value) {
			out.title = value;
		} else if (name === 'density') {
			const v = value.toLowerCase();
			if (v === 'compact' || v === 'comfortable') out.density = v;
		} else if (name === 'layers') {
			const words = value.toLowerCase().split(/[\s,]+/).filter(Boolean);
			if (words.length === 1 && words[0] === 'none') out.layers = [];
			else {
				const layers = LAYERS.filter((l) => words.includes(l));
				if (layers.length) out.layers = layers;
			}
		}
	}
	return out;
}
