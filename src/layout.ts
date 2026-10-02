/*
 * Spans (events, trips, plans) on the year's rows. A span is cut where a month ends, since each month is its own row,
 * and spans that overlap in a row are stacked in lanes, the longer first. Past the lane limit a span is not drawn and
 * each of its days counts it as hidden, so the grid can say "+1" instead of overflowing. Pure.
 */
import { cellOf, daysInMonth, isoOf, type Weekday } from './grid.ts';

export interface Span {
	id: string;
	start: string;
	end: string;
}

export interface Segment<T extends Span> {
	item: T;
	month: number;
	startCol: number;
	endCol: number;
	lane: number;
	/** The span begins in this row (it was not carried over from the month before). */
	startsHere: boolean;
	/** The span ends in this row. */
	endsHere: boolean;
}

export interface Layout<T extends Span> {
	rows: Segment<T>[][];
	hidden: Map<string, number>;
}

interface Piece<T extends Span> {
	item: T;
	month: number;
	from: string;
	to: string;
	startsHere: boolean;
	endsHere: boolean;
}

export function layoutSpans<T extends Span>(items: readonly T[], year: number, weekStart: Weekday, maxLanes: number): Layout<T> {
	const yearStart = isoOf(year, 0, 1);
	const yearEnd = isoOf(year, 11, 31);
	const pieces: Piece<T>[][] = Array.from({ length: 12 }, () => []);
	for (const item of items) {
		const start = item.start;
		const end = item.end < item.start ? item.start : item.end;
		if (end < yearStart || start > yearEnd) continue;
		const from = start < yearStart ? yearStart : start;
		const to = end > yearEnd ? yearEnd : end;
		const m0 = Number(from.slice(5, 7)) - 1;
		const m1 = Number(to.slice(5, 7)) - 1;
		for (let m = m0; m <= m1; m++) {
			const monthStart = isoOf(year, m, 1);
			const monthEnd = isoOf(year, m, daysInMonth(year, m));
			const a = from > monthStart ? from : monthStart;
			const b = to < monthEnd ? to : monthEnd;
			pieces[m]?.push({ item, month: m, from: a, to: b, startsHere: a === start, endsHere: b === end });
		}
	}
	const rows: Segment<T>[][] = [];
	const hidden = new Map<string, number>();
	pieces.forEach((list, month) => {
		// the earlier first, and of two that start the same day the longer, so long spans keep the lower lanes
		list.sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : x.to > y.to ? -1 : x.to < y.to ? 1 : 0));
		const laneEnds: string[] = [];
		const row: Segment<T>[] = [];
		for (const p of list) {
			let lane = laneEnds.findIndex((endIso) => endIso < p.from);
			if (lane === -1) lane = laneEnds.length;
			if (lane >= maxLanes) {
				const d0 = Number(p.from.slice(8, 10));
				const d1 = Number(p.to.slice(8, 10));
				for (let d = d0; d <= d1; d++) {
					const iso = isoOf(year, month, d);
					hidden.set(iso, (hidden.get(iso) ?? 0) + 1);
				}
				continue;
			}
			laneEnds[lane] = p.to;
			row.push({
				item: p.item,
				month,
				startCol: cellOf(p.from, weekStart).col,
				endCol: cellOf(p.to, weekStart).col,
				lane,
				startsHere: p.startsHere,
				endsHere: p.endsHere,
			});
		}
		rows.push(row);
	});
	return { rows, hidden };
}
