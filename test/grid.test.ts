/* The year as Nick Milo's Linear Calendar lays it out: a row per month, 37 columns lined up by weekday. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	COLUMNS,
	addDays,
	columnWeekdays,
	daysBetween,
	daysInMonth,
	firstColumn,
	isoOf,
	weekdayOf,
	yearGrid,
} from '../src/grid.ts';

test('37 columns hold any month whatever its first weekday', () => {
	assert.equal(COLUMNS, 37);
	for (let y = 2024; y <= 2030; y++) {
		for (const start of [0, 1, 6] as const) {
			for (const row of yearGrid(y, start, [0, 6])) {
				const last = row.days[row.days.length - 1];
				assert.ok(last && last.col < COLUMNS, `${y}-${row.month + 1} start ${start}`);
			}
		}
	}
});

test('2026, weeks from Sunday, as the template prints it', () => {
	const rows = yearGrid(2026, 0, [0, 6]);
	assert.equal(rows.length, 12);
	assert.equal(rows[0]?.firstCol, 4, 'Jan 1 2026 is a Thursday');
	assert.equal(rows[1]?.firstCol, 0, 'Feb 1 2026 is a Sunday');
	const aug = rows[7];
	assert.equal(aug?.firstCol, 6, 'Aug 1 2026 is a Saturday');
	assert.equal(aug?.days[30]?.col, 36, 'so Aug 31 falls in the last column');
	assert.equal(rows[1]?.days.length, 28);
});

test('weeks from Monday move every month one column left', () => {
	assert.equal(firstColumn(2026, 0, 1), 3);
	assert.equal(firstColumn(2026, 1, 1), 6, 'a Sunday is the last day of a Monday week');
	assert.equal(firstColumn(2026, 0, 6), 5, 'from Saturday');
});

test('the column heads repeat the week from its first day', () => {
	const sun = columnWeekdays(0);
	assert.equal(sun.length, COLUMNS);
	assert.deepEqual(sun.slice(0, 8), [0, 1, 2, 3, 4, 5, 6, 0]);
	assert.deepEqual(sun.slice(-2), [0, 1], 'the template ends on Su, Mo');
	assert.deepEqual(columnWeekdays(1).slice(0, 7), [1, 2, 3, 4, 5, 6, 0]);
});

test('a cell knows its date, its weekday and whether it is a weekend day', () => {
	const jan = yearGrid(2026, 0, [5, 6])[0];
	const first = jan?.days[0];
	assert.deepEqual(first, { iso: '2026-01-01', day: 1, month: 0, weekday: 4, col: 4, weekend: false });
	assert.equal(jan?.days[1]?.weekend, true, 'Jan 2 2026 is a Friday, a weekend day where Friday and Saturday are');
	assert.equal(yearGrid(2026, 0, [0, 6])[0]?.days[1]?.weekend, false);
});

test('dates: leap years, weekdays, adding and counting days', () => {
	assert.equal(daysInMonth(2028, 1), 29);
	assert.equal(daysInMonth(2026, 1), 28);
	assert.equal(daysInMonth(2026, 11), 31);
	assert.equal(isoOf(2026, 0, 5), '2026-01-05');
	assert.equal(weekdayOf('2026-10-01'), 4, '1 Oct 2026 is a Thursday');
	assert.equal(addDays('2026-12-31', 1), '2027-01-01');
	assert.equal(addDays('2026-03-01', -1), '2026-02-28');
	assert.equal(daysBetween('2026-01-30', '2026-02-02'), 3);
});
