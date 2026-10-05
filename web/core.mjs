export const DEFAULT_SHIFTS = {
  D: { label: 'Day shift', start: '07:00', end: '15:00' },
  E: { label: 'Evening shift', start: '15:00', end: '23:00' },
  N: { label: 'Night shift', start: '23:00', end: '07:00' },
  O: { label: 'Day off', start: '', end: '' },
};

export function validMonth(month) {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);
}

export function shiftEvent(row, month, shifts) {
  if (!validMonth(month)) throw Error('Choose a month between 2000 and 2099.');
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  if (!Number.isInteger(row.day) || row.day < 1 || row.day > lastDay) throw Error('Check the day of the month.');
  if (!Object.hasOwn(shifts, row.code)) throw Error('Choose a shift code.');
  if (row.code === 'O') return null;
  const shift = shifts[row.code];
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(shift.start) || !time.test(shift.end)) throw Error('Set valid start and end times.');
  if (shift.start === shift.end) throw Error('Start and end cannot be the same.');
  const [sh, sm] = shift.start.split(':').map(Number);
  const [eh, em] = shift.end.split(':').map(Number);
  // Korea Standard Time is UTC+09:00, without daylight saving in this date range.
  const start = Date.UTC(year, mon - 1, row.day, sh - 9, sm);
  let end = Date.UTC(year, mon - 1, row.day, eh - 9, em);
  if (end <= start) end += 86400000;
  return { day: row.day, code: row.code, label: shift.label, start, end, overnight: end - start > 0 && eh * 60 + em < sh * 60 + sm };
}

export function review(rows, month, shifts) {
  const errors = [], events = [], days = new Set();
  if (!rows.length) errors.push('Read a roster first.');
  rows.forEach((row, i) => {
    if (!row.checked) errors.push(`Row ${i + 1}: confirm against the original.`);
    if (days.has(row.day)) errors.push(`Day ${row.day}: two entries. Remove the extra row or correct its day.`);
    days.add(row.day);
    try { const event = shiftEvent(row, month, shifts); if (event) events.push(event); }
    catch (error) { errors.push(`Row ${i + 1}: ${error.message}`); }
  });
  events.sort((a, b) => a.start - b.start);
  for (let i = 1; i < events.length; i++) {
    if (events[i].start < events[i - 1].end) errors.push(`Days ${events[i - 1].day} and ${events[i].day}: shifts overlap.`);
  }
  return { errors, events };
}

function escapeText(s) { return s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
function fold(line) {
  let out = '', current = '', bytes = 0;
  for (const char of line) {
    const n = new TextEncoder().encode(char).length;
    if (bytes + n > 75) { out += current + '\r\n'; current = ' '; bytes = 1; }
    current += char; bytes += n;
  }
  return out + current;
}
const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function calendar(rows, month, shifts, now = Date.now()) {
  const { errors, events } = review(rows, month, shifts);
  if (errors.length) throw Error(errors[0]);
  if (!events.length) throw Error('There are no work shifts to export.');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ShiftCal//Roster Review//EN',
    'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Reviewed shifts'];
  for (const event of events) lines.push('BEGIN:VEVENT',
    `UID:shiftcal-${month}-${String(event.day).padStart(2, '0')}@shiftcal.local`,
    `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(event.start)}`, `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escapeText(event.label)}`, 'DESCRIPTION:Confirmed in ShiftCal. Times entered in Korea Standard Time (UTC+09:00).',
    'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
