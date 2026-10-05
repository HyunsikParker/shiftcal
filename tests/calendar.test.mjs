import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHIFTS as shifts, shiftEvent, review, calendar } from '../web/core.mjs';
const row = (day, code = 'D', checked = true) => ({ day, code, checked });
test('a Korean night shift ends next month in UTC', () => {
  const e = shiftEvent(row(31, 'N'), '2026-10', shifts);
  assert.equal(new Date(e.start).toISOString(), '2026-10-31T14:00:00.000Z');
  assert.equal(new Date(e.end).toISOString(), '2026-10-31T22:00:00.000Z');
  assert.equal(e.overnight, true);
});
test('year boundary and leap day are real dates', () => {
  const e = shiftEvent(row(31, 'N'), '2026-12', shifts);
  assert.equal(e.end - e.start, 8 * 3600000);
  assert.doesNotThrow(() => shiftEvent(row(29), '2028-02', shifts));
  assert.throws(() => shiftEvent(row(29), '2027-02', shifts));
  assert.throws(() => shiftEvent(row(31), '2026-04', shifts));
});
test('unchecked, unknown and duplicate rows block export', () => {
  assert.throws(() => calendar([row(1, 'D', false)], '2026-10', shifts));
  assert.throws(() => calendar([row(1, '?')], '2026-10', shifts));
  assert.throws(() => calendar([row(1), row(1, 'N')], '2026-10', shifts));
});
test('off days stay reviewed but do not create events', () => {
  assert.equal(review([row(1), row(2, 'O')], '2026-10', shifts).events.length, 1);
  const ics = calendar([row(1), row(2, 'O')], '2026-10', shifts, 0);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 1);
  assert.match(ics, /DTSTART:20260930T220000Z/);
  assert.throws(() => calendar([row(1, 'O')], '2026-10', shifts));
});
test('overlap across midnight blocks export, boundary-touching does not', () => {
  const custom = structuredClone(shifts); custom.N.end = '08:00';
  assert.throws(() => calendar([row(1, 'N'), row(2, 'D')], '2026-10', custom), /overlap/);
  assert.doesNotThrow(() => calendar([row(1, 'N'), row(2, 'D')], '2026-10', shifts));
});
test('bad times and missing month cannot become dates', () => {
  for (const time of ['24:00', '7:99', '', '19:60']) {
    const custom = structuredClone(shifts); custom.D.start = time;
    assert.throws(() => shiftEvent(row(1), '2026-10', custom));
  }
  for (const month of ['', '2026-13', '1999-12', '2026-1']) assert.throws(() => shiftEvent(row(1), month, shifts));
  assert.throws(() => shiftEvent(row(1.5), '2026-10', shifts));
});
test('ICS escapes text and folds UTF-8 at 75 octets', () => {
  const custom = structuredClone(shifts); custom.D.label = '주간;근무,확인\n' + '가'.repeat(80);
  const ics = calendar([row(1)], '2026-10', custom);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.match(ics, /주간\\;근무\\,확인\\n/);
});
