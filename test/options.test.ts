/* What a `year-map` block may say: which year, which title, how dense, and which layers. Anything else is left to the
 * settings. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlockOptions } from '../src/options.ts';

test('an empty block takes everything from the settings', () => {
	assert.deepEqual(parseBlockOptions(''), {});
	assert.deepEqual(parseBlockOptions('\n  \n'), {});
});

test('a year, a title, a density and the layers, one per line', () => {
	const o = parseBlockOptions('year: 2027\ntitle: The year of the thesis\ndensity: compact\nlayers: tasks, events\n');
	assert.equal(o.year, 2027);
	assert.equal(o.title, 'The year of the thesis');
	assert.equal(o.density, 'compact');
	assert.deepEqual(o.layers, ['tasks', 'events']);
});

test('a year relative to this one, and what is not understood is ignored', () => {
	assert.equal(parseBlockOptions('year: next').yearOffset, 1);
	assert.equal(parseBlockOptions('year: last').yearOffset, -1);
	assert.equal(parseBlockOptions('year: +2').yearOffset, 2);
	assert.equal(parseBlockOptions('year: this').yearOffset, 0);
	assert.deepEqual(parseBlockOptions('year: soon\ndensity: huge\nlayers: dreams\ncolour: red'), {}, 'nothing guessed at');
	assert.deepEqual(parseBlockOptions('Year: 2030\r\nLAYERS: Days').year, 2030, 'names in any case, and CRLF');
	assert.deepEqual(parseBlockOptions('layers: days, dreams').layers, ['days']);
	assert.deepEqual(parseBlockOptions('layers: none').layers, [], 'no layer at all is a choice');
});
