/*
 * Events that come back: every year on the same day, or every year on the same day of the Umm al-Qura calendar (the
 * Hijri calendar of Saudi Arabia). Umm al-Qura is computed, and Ramadan and the two Eids begin where they are announced,
 * which can be a day or two off it: an offset moves every day it computes, and a date a year's occurrence was observed
 * on takes that occurrence's place. The days a note gives are drawn as written. The Hijri dates come from the
 * platform's own Intl (`islamic-umalqura`), in Obsidian as in Node; where it has no such calendar, an event that
 * repeats by it is drawn once, on the days its note gives, and the map says why. Pure apart from Intl.
 */
import { addDays, daysBetween, daysInMonth, isoOf } from './grid.ts';

export interface Occurrence {
	start: string;
	end: string;
}

export interface Hijri {
	year: number;
	month: number;
	day: number;
}

const YEARLY = new Set(['yearly', 'annually', 'annual', 'every year', 'each year']);
const HIJRI = new Set(['hijri', 'islamic', 'umm al-qura', 'umalqura', 'islamic-umalqura']);

/** A note's repeat property says the event comes back every year. */
export function isYearly(v: unknown): boolean {
	return typeof v === 'string' && YEARLY.has(v.trim().toLowerCase());
}

/** A note's calendar property names the Hijri calendar. */
export function isHijri(v: unknown): boolean {
	return typeof v === 'string' && HIJRI.has(v.trim().toLowerCase());
}

/** The yearly event's days that meet `year`: this year's, and last year's when it runs across the new year. Never
 * before its first year; the 29th of February falls on the 28th in a common year. */
export function yearlyOccurrences(start: string, end: string, year: number): Occurrence[] {
	const first = Number(start.slice(0, 4));
	const month = Number(start.slice(5, 7)) - 1;
	const span = Math.max(0, daysBetween(start, end));
	const out: Occurrence[] = [];
	for (const y of [year - 1, year]) {
		if (y < first) continue;
		const s = isoOf(y, month, Math.min(Number(start.slice(8, 10)), daysInMonth(y, month)));
		const e = addDays(s, span);
		if (e < isoOf(year, 0, 1) || s > isoOf(year, 11, 31)) continue;
		out.push({ start: s, end: e });
	}
	return out;
}

let formatter: Intl.DateTimeFormat | null | undefined;
const hijriCache = new Map<string, Hijri | null>();

function hijriFormat(): Intl.DateTimeFormat | null {
	if (formatter !== undefined) return formatter;
	try {
		const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
		formatter = f.resolvedOptions().calendar === 'islamic-umalqura' ? f : null;
	} catch {
		formatter = null;
	}
	return formatter;
}

/** The platform has the Umm al-Qura calendar. */
export function hijriAvailable(): boolean {
	return hijriFormat() !== null;
}

/** A Gregorian date on the Umm al-Qura calendar, or null where the platform does not have it. */
export function toHijri(iso: string): Hijri | null {
	const known = hijriCache.get(iso);
	if (known !== undefined) return known;
	const f = hijriFormat();
	let h: Hijri | null = null;
	if (f) {
		const parts = f.formatToParts(new Date(`${iso}T00:00:00Z`));
		const num = (type: string): number => Number((parts.find((p) => p.type === type)?.value ?? '').replace(/\D/g, ''));
		const year = num('year');
		const month = num('month');
		const day = num('day');
		if (year && month && day) h = { year, month, day };
	}
	if (hijriCache.size > 20000) hijriCache.clear();
	hijriCache.set(iso, h);
	return h;
}

// a Hijri date as one number that grows with it: months up to 12, days up to 30
const ordinal = (h: Hijri): number => h.year * 500 + h.month * 32 + h.day;

/** The Gregorian date of a Hijri one, found near `nearYear`. A day the month does not have (the 30th of a month of 29)
 * is its last day. */
export function fromHijri(year: number, month: number, day: number, nearYear: number): string | null {
	const anchor = isoOf(nearYear, 6, 1);
	const a = toHijri(anchor);
	if (!a) return null;
	const target = ordinal({ year, month, day });
	let iso = addDays(anchor, Math.round((year - a.year) * 354.367 + (month - a.month) * 29.53 + (day - a.day)));
	for (let step = 0; step < 60; step++) {
		const h = toHijri(iso);
		if (!h) return null;
		const o = ordinal(h);
		if (o === target) return iso;
		if (o > target) {
			iso = addDays(iso, -1);
			continue;
		}
		const next = addDays(iso, 1);
		const hn = toHijri(next);
		if (!hn) return null;
		// the next day is past the target: the target is a day this month does not have, or the month has ended
		if (ordinal(hn) > target) return h.year === year && h.month === month ? iso : next;
		iso = next;
	}
	return null;
}

/** The days of an event that comes back every Hijri year, in a Gregorian year: one occurrence per Hijri year whose span
 * meets it (two, some years: a Hijri year is eleven days shorter), never before the event's first. */
export function hijriOccurrences(start: string, end: string, year: number): Occurrence[] {
	const h0 = toHijri(start);
	const h1 = toHijri(end < start ? start : end);
	const first = toHijri(isoOf(year, 0, 1));
	const last = toHijri(isoOf(year, 11, 31));
	if (!h0 || !h1 || !first || !last) return [];
	// an event across the Hijri new year ends in the Hijri year after the one it starts in
	const later = h1.year - h0.year;
	const out: Occurrence[] = [];
	for (let hy = first.year - 1 - later; hy <= last.year; hy++) {
		if (hy < h0.year) continue;
		const s = fromHijri(hy, h0.month, h0.day, year);
		const e = fromHijri(hy + later, h1.month, h1.day, year);
		if (!s || !e) continue;
		if (e < isoOf(year, 0, 1) || s > isoOf(year, 11, 31)) continue;
		out.push({ start: s, end: e < s ? s : e });
	}
	return out;
}

export interface RepeatOptions {
	/** On the Umm al-Qura calendar; otherwise the Gregorian. */
	hijri: boolean;
	/** Days added to every day Umm al-Qura computes, at most two either way. */
	offset?: number;
	/** Dates a year's occurrence was observed on, each taking the place of the occurrence it is nearest. */
	observed?: readonly string[];
}

// how far an observed date may be from the occurrence it moves
const OBSERVED_WITHIN = 30;

/** The days an event that comes back is drawn on in `year`. Worked out for the years either side too, so that a day
 * moved across the turn of the year lands in the year it is moved to. */
export function occurrencesIn(start: string, end: string, year: number, o: RepeatOptions): Occurrence[] {
	const of = (y: number): Occurrence[] => (o.hijri ? hijriOccurrences(start, end, y) : yearlyOccurrences(start, end, y));
	const byStart = new Map<string, Occurrence>();
	for (const y of [year - 1, year, year + 1]) for (const x of of(y)) byStart.set(x.start, x);
	const offset = o.hijri ? Math.max(-2, Math.min(2, Math.trunc(o.offset ?? 0) || 0)) : 0;
	// the occurrence that starts on the note's own day is the note's, drawn as written
	let all = [...byStart.values()]
		.map((x) => (offset && x.start !== start ? { start: addDays(x.start, offset), end: addDays(x.end, offset) } : x));
	for (const day of o.observed ?? []) {
		const gap = (x: Occurrence): number => Math.abs(daysBetween(x.start, day));
		const near = all.filter((x) => gap(x) <= OBSERVED_WITHIN).sort((a, b) => gap(a) - gap(b))[0];
		if (near) all = all.map((x) => (x === near ? { start: day, end: addDays(day, daysBetween(x.start, x.end)) } : x));
	}
	const first = isoOf(year, 0, 1);
	const last = isoOf(year, 11, 31);
	return all.filter((x) => x.end >= first && x.start <= last).sort((a, b) => (a.start < b.start ? -1 : 1));
}
