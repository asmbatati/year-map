/* Spans on the year's rows: split where a month ends, stacked in lanes where they overlap. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutSpans } from '../src/layout.ts';

const ev = (id: string, start: string, end: string) => ({ id, start, end });

test('a span inside one month is one segment, in lane 0', () => {
	const { rows } = layoutSpans([ev('a', '2026-03-10', '2026-03-12')], 2026, 0, 3);
	const mar = rows[2] ?? [];
	assert.equal(mar.length, 1);
	const seg = mar[0];
	assert.ok(seg);
	assert.equal(seg.lane, 0);
	// March 2026 starts on a Sunday (column 0), so the 10th is column 9
	assert.equal(seg.startCol, 9);
	assert.equal(seg.endCol, 11);
	assert.ok(seg.startsHere && seg.endsHere);
});

test('a span across a month boundary is cut into one segment per row', () => {
	const { rows } = layoutSpans([ev('trip', '2026-01-30', '2026-02-02')], 2026, 0, 3);
	const jan = rows[0]?.[0];
	const feb = rows[1]?.[0];
	assert.ok(jan && feb);
	assert.equal(jan.startsHere, true);
	assert.equal(jan.endsHere, false);
	assert.equal(feb.startsHere, false);
	assert.equal(feb.endsHere, true);
	assert.equal(feb.startCol, 0, 'Feb 1 2026 is a Sunday');
	assert.equal(feb.endCol, 1);
});

test('overlapping spans take the next lane; a later span reuses a lane that is free again', () => {
	const { rows } = layoutSpans([
		ev('a', '2026-05-01', '2026-05-05'),
		ev('b', '2026-05-03', '2026-05-08'),
		ev('c', '2026-05-07', '2026-05-09'),
	], 2026, 0, 3);
	const lanes = Object.fromEntries((rows[4] ?? []).map((s) => [s.item.id, s.lane]));
	assert.deepEqual(lanes, { a: 0, b: 1, c: 0 });
});

test('the longer span takes the lower lane when two start the same day', () => {
	const { rows } = layoutSpans([ev('short', '2026-06-02', '2026-06-02'), ev('long', '2026-06-02', '2026-06-20')], 2026, 0, 3);
	const lanes = Object.fromEntries((rows[5] ?? []).map((s) => [s.item.id, s.lane]));
	assert.deepEqual(lanes, { long: 0, short: 1 });
});

test('spans outside the year are dropped, and one that crosses its edge is clipped', () => {
	const { rows } = layoutSpans([
		ev('before', '2025-11-01', '2025-11-03'),
		ev('edge', '2025-12-30', '2026-01-02'),
		ev('after', '2027-01-01', '2027-01-01'),
	], 2026, 0, 3);
	const all = rows.flat();
	assert.deepEqual(all.map((s) => s.item.id), ['edge']);
	const only = all[0];
	assert.ok(only);
	assert.equal(only.startsHere, false, 'it began last year');
	assert.equal(only.startCol, 4);
});

test('past the lane limit a span is not drawn, and each of its days counts it as hidden', () => {
	const { rows, hidden } = layoutSpans([
		ev('a', '2026-07-01', '2026-07-03'),
		ev('b', '2026-07-01', '2026-07-03'),
		ev('c', '2026-07-02', '2026-07-02'),
	], 2026, 0, 2);
	assert.equal((rows[6] ?? []).length, 2);
	assert.equal(hidden.get('2026-07-02'), 1);
	assert.equal(hidden.get('2026-07-01'), undefined);
});

test('an end before its start is read as the same day', () => {
	const { rows } = layoutSpans([ev('x', '2026-08-10', '2026-08-01')], 2026, 0, 3);
	const seg = rows[7]?.[0];
	assert.ok(seg);
	assert.equal(seg.startCol, seg.endCol);
});
