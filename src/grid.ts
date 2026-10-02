/*
 * The year as a linear calendar lays it out (after Nick Milo's Linear Calendar, CC BY 4.0): a row per month and 37
 * columns lined up by weekday, so a weekday keeps its column all year. A month starting on the week's last day still
 * fits: 6 empty columns and 31 days make 37. Pure: dates are ISO strings, computed in UTC, no time zone involved.
 */

export const COLUMNS = 37;

/** 0 is Sunday, as JavaScript counts. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DayCell {
	iso: string;
	day: number;
	month: number;
	weekday: Weekday;
	col: number;
	weekend: boolean;
}

export interface MonthRow {
	month: number;
	firstCol: number;
	days: DayCell[];
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function isoOf(year: number, month0: number, day: number): string {
	return `${year}-${pad(month0 + 1)}-${pad(day)}`;
}

function utc(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function isoOfDate(d: Date): string {
	return isoOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function weekdayOf(iso: string): Weekday {
	return utc(iso).getUTCDay() as Weekday;
}

export function daysInMonth(year: number, month0: number): number {
	return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function addDays(iso: string, n: number): string {
	const d = utc(iso);
	d.setUTCDate(d.getUTCDate() + n);
	return isoOfDate(d);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
	return Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
}

/** The column of a month's first day: how far its weekday sits from the week's first day. */
export function firstColumn(year: number, month0: number, weekStart: Weekday): number {
	return (weekdayOf(isoOf(year, month0, 1)) - weekStart + 7) % 7;
}

/** The weekday of each of the 37 columns, the week repeating from its first day. */
export function columnWeekdays(weekStart: Weekday): Weekday[] {
	return Array.from({ length: COLUMNS }, (_, i) => ((weekStart + i) % 7) as Weekday);
}

export function yearGrid(year: number, weekStart: Weekday, weekendDays: readonly number[]): MonthRow[] {
	const weekend = new Set(weekendDays);
	return Array.from({ length: 12 }, (_, month) => {
		const firstCol = firstColumn(year, month, weekStart);
		const days = Array.from({ length: daysInMonth(year, month) }, (_, i): DayCell => {
			const iso = isoOf(year, month, i + 1);
			const weekday = weekdayOf(iso);
			return { iso, day: i + 1, month, weekday, col: firstCol + i, weekend: weekend.has(weekday) };
		});
		return { month, firstCol, days };
	});
}

/** Where a date sits on the grid of its year: the row (month) and the column. */
export function cellOf(iso: string, weekStart: Weekday): { year: number; month: number; col: number } {
	const [y, m, d] = iso.split('-').map(Number);
	const year = y ?? 1970;
	const month = (m ?? 1) - 1;
	return { year, month, col: firstColumn(year, month, weekStart) + (d ?? 1) - 1 };
}
