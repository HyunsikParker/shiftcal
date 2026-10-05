import { DEFAULT_SHIFTS, shiftEvent, review, calendar } from './core.mjs';
const $ = id => document.getElementById(id);
let rows = [], local = false, busy = false, shifts = structuredClone(DEFAULT_SHIFTS);
const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
function node(tag, text, className) { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; }
function status(text, error = false) { $('status').textContent = text; $('status').className = 'status' + (error ? ' error' : ''); }
function setBusy(value) { busy = value; $('extract').disabled = value || !local; $('example').disabled = value; $('roster').disabled = value; $('clear').disabled = value; }
function updateExport() {
  const result = review(rows, $('month').value, shifts);
  $('count').textContent = `${result.events.length} work shift${result.events.length === 1 ? '' : 's'}`;
  $('errors').replaceChildren();
  // Per-row confirmations are already visible; avoid repeating every unchecked row.
  const unchecked = rows.filter(r => !r.checked).length;
  const errors = result.errors.filter(x => !x.includes('confirm against'));
  if (unchecked) errors.unshift(`${unchecked} row${unchecked === 1 ? '' : 's'} still need confirmation.`);
  for (const error of errors) $('errors').append(node('li', error));
  $('export').disabled = result.errors.length > 0 || !result.events.length;
}
function render() {
  $('rows').replaceChildren(); $('empty').hidden = rows.length > 0; $('export-panel').hidden = !rows.length;
  rows.forEach((row, i) => {
    const card = node('article', '', 'row' + (row.checked ? ' confirmed' : ''));
    const source = node('div', '', 'source'); source.append(node('span', `Line ${row.line}`), node('code', row.source)); card.append(source);
    const fields = node('div', '', 'row-fields');
    const dayLabel = node('label', 'Day'); const day = node('input'); day.type = 'number'; day.min = '1'; day.max = '31'; day.value = row.day || ''; day.setAttribute('aria-label', `Day for line ${row.line}`); dayLabel.append(day);
    const shiftLabel = node('label', 'Shift'); const shift = node('select'); shift.setAttribute('aria-label', `Shift for line ${row.line}`);
    [['?', 'Needs correction'], ['D', 'D · Day'], ['E', 'E · Evening'], ['N', 'N · Night'], ['O', 'O · Day off']].forEach(([value, label]) => { const option = node('option', label); option.value = value; shift.append(option); }); shift.value = row.code; shiftLabel.append(shift);
    const remove = node('button', '×', 'remove'); remove.setAttribute('aria-label', `Remove line ${row.line}`); remove.onclick = () => { rows.splice(i, 1); render(); };
    fields.append(dayLabel, shiftLabel, remove); card.append(fields);
    const when = node('p', '', 'when');
    const showTime = () => { try { const event = shiftEvent(row, $('month').value, shifts); when.textContent = event ? `${dateFormat.format(event.start)} → ${dateFormat.format(event.end)} KST${event.overnight ? ' · next day' : ''}` : 'Day off · no event will be exported'; } catch (error) { when.textContent = error.message; } }; showTime(); card.append(when);
    if (row.note) card.append(node('p', row.note + ' — check the original before confirming.', 'note'));
    const confirm = node('label', '', 'confirm'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = row.checked; confirm.append(checkbox, node('span', 'I checked the date, shift and times against the original.')); card.append(confirm);
    const changed = () => { row.checked = false; checkbox.checked = false; card.classList.remove('confirmed'); showTime(); updateExport(); };
    day.oninput = () => { row.day = Number(day.value); changed(); };
    shift.onchange = () => { row.code = shift.value; changed(); };
    checkbox.onchange = () => { row.checked = checkbox.checked; card.classList.toggle('confirmed', row.checked); updateExport(); };
    $('rows').append(card);
  }); updateExport();
}
for (const code of ['D', 'E', 'N']) {
  const line = node('div', '', 'time-row'); line.append(node('span', `${code} · ${shifts[code].label.replace(' shift', '')}`));
  for (const key of ['start', 'end']) { const input = node('input'); input.type = 'text'; input.className = 'shift-time'; input.maxLength = 5; input.placeholder = 'HH:MM'; input.pattern = '(?:[01][0-9]|2[0-3]):[0-5][0-9]'; input.value = shifts[code][key]; input.setAttribute('aria-label', `${shifts[code].label} ${key} (24-hour)`); input.oninput = () => { shifts[code][key] = input.value; rows.forEach(r => r.checked = false); render(); }; line.append(input); }
  $('shift-settings').append(line);
}
$('month').oninput = () => { rows.forEach(r => r.checked = false); render(); };
$('roster').oninput = () => { if (rows.length) { rows = []; render(); status('Input changed. Read it again before exporting.'); } };
$('clear').onclick = () => { rows = []; $('roster').value = ''; render(); status('Session cleared.'); };
$('extract').onclick = async () => {
  if (!local || busy) return;
  rows = []; render(); setBusy(true); status('Reading on your computer… This can take up to 150 seconds.');
  try { const response = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: $('roster').value }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); rows = data.rows; render(); status(`Gemma read ${rows.length} lines in ${data.duration_seconds}s. Nothing has been confirmed yet.`); }
  catch (error) { status(error.message || 'Could not read this roster.', true); }
  finally { setBusy(false); }
};
$('example').onclick = async () => {
  if (busy) return;
  setBusy(true);
  try { const response = await fetch('./example.json'); if (!response.ok) throw Error('Recorded example is unavailable.'); const data = await response.json(); $('roster').value = data.input; $('month').value = data.month; rows = data.result.rows.map(r => ({ ...r, checked: false })); render(); status(`Recorded Gemma response · fictional roster · ${data.result.duration_seconds}s when captured. No inference runs in this example.`); }
  catch (error) { status(error.message, true); }
  finally { setBusy(false); }
};
$('export').onclick = () => {
  try { const content = calendar(rows, $('month').value, shifts); const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' })); const a = node('a'); a.href = url; a.download = `shifts-${$('month').value}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); status('Calendar download requested. Review the file in a separate calendar before relying on it.'); }
  catch (error) { status(error.message, true); }
};
try { const response = await fetch('./api/status'); const data = await response.json(); local = response.ok && data.mode === 'local'; } catch {}
$('mode').textContent = local ? 'Local mode · Gemma on this computer' : 'Public demo · recorded example only';
if (!local) { $('roster').readOnly = true; $('roster').placeholder = 'Try the recorded example to review shifts and export a calendar.\n\nRun ShiftCal locally to read your own roster.'; }
setBusy(false); render();
