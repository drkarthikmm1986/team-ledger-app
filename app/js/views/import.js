/* Import entries into one account from a statement: PDF (old Team Ledger / bank), Excel, CSV or pasted text.
   Everything runs on the phone; nothing is uploaded.
   Auto-detects: date, time, details, In / Out (separate columns, Cr/Dr, type column, sign or running balance),
   profit % / profit amount and commission % per row. Preview lets you change In/Out per row, edit a row,
   pick the profit source and date order, skip duplicates. Undo is offered after adding. */
import { $, esc, T, TP, ic, money, moneyAbs, uid, dmy } from '../core/util.js';
import { calcProfit, isSettle } from '../core/ledger.js';
import { toast, openSheet, closeSheet } from '../ui/kit.js';

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
const year = y => (y = Number(y), y < 100 ? 2000 + y : y);
const okDate = (y, m, d) => y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null;
/** First date in a text → [iso, matchedText, ambiguous]. mdy: read 03/04/2026 as March 4. */
export function findDate(s, mdy) {
  let m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) { const d = okDate(+m[1], +m[2], +m[3]); if (d) return [d, m[0], false]; }
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) { const a = +m[1], b = +m[2], amb = a <= 12 && b <= 12 && a !== b; const d = mdy && amb ? okDate(year(m[3]), a, b) : okDate(year(m[3]), b, a) || okDate(year(m[3]), a, b); if (d) return [d, m[0], amb]; }
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*([A-Za-z]{3,9})\.?[\s,-]*(\d{2,4})\b/);
  if (m && MON[m[2].toLowerCase().slice(0, 3)]) { const d = okDate(year(m[3]), MON[m[2].toLowerCase().slice(0, 3)], +m[1]); if (d) return [d, m[0], false]; }
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m && MON[m[1].toLowerCase().slice(0, 3)]) { const d = okDate(+m[3], MON[m[1].toLowerCase().slice(0, 3)], +m[2]); if (d) return [d, m[0], false]; }
  return null;
}
const AMT = /(?:([−–-])\s*)?(?:₹|Rs\.?|INR)?\s*(\()?(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|(?<=₹\s?)\d+)(\))?(?:\s*(Cr|Dr|CR|DR)\b)?/g;
/** Amounts in a text (paise, signed when the text shows a sign). */
export function findAmounts(s) {
  const out = []; let m; AMT.lastIndex = 0;
  while ((m = AMT.exec(s))) {
    const v = Math.round(Number(m[3].replace(/,/g, '')) * 100); if (!v) continue;
    const neg = !!m[1] || (!!m[2] && !!m[4]) || /dr/i.test(m[5] || ''), pos = /cr/i.test(m[5] || '');
    out.push({ v, sign: neg ? -1 : pos ? 1 : 0, hint: /dr/i.test(m[5] || '') ? -1 : pos ? 1 : 0, text: m[0] });
  }
  return out;
}
const num = s => { const a = findAmounts(String(s)); if (a.length) return a[0].v * (a[0].sign || 1); const n = Number(String(s).replace(/[^\d.-]/g, '')); return isFinite(n) && String(s).trim() !== '' ? Math.round(n * 100) : 0; };
const SKIP = /\b(total|grand total|opening|closing|balance as of|as of|balance b\/f|brought forward|carried forward)\b|மொத்தம்|தொடக்க இருப்பு|முடிவு இருப்பு/i;
const time24 = m => { let h = +m[1]; const ap = (m[3] || '').toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; return pad(h) + ':' + m[2]; };
const TIME = /\b([01]?\d|2[0-3]):([0-5]\d)(?::\d\d)?\s*(AM|PM|am|pm)?\b/;
const cleanNote = s => s.replace(/[·•|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g, '').trim();
const IN_WORD = /^(in|cr|credit|deposit|received|receipt|inward|வரவு|\+)$/i, OUT_WORD = /^(out|dr|debit|withdrawal|withdraw|paid|payment|outward|செலவு|-)$/i;
function extractPct(s) {
  const m = s.match(/(\d+(?:\.\d+)?)\s*%(?:\s*\((?:₹|Rs\.?)?\s*[\d,]+(?:\.\d+)?\))?/);
  return m ? { bp: Math.round(Number(m[1]) * 100), rest: s.replace(m[0], ' ') } : { bp: null, rest: s };
}

/* ---------- 1. statement text (PDF / paste): each row starts at a line with a date ---------- */
export function parseLines(lines, mdy) {
  const rows = []; let cur = null, amb = false;
  for (const raw of lines) {
    const line = String(raw || '').replace(/\s+/g, ' ').trim(); if (!line) continue;
    const dt = findDate(line, mdy);
    if (dt) {
      amb = amb || dt[2];
      let rest = line.replace(dt[1], ' ');
      const pct = extractPct(rest); rest = pct.rest;
      const tm = rest.match(TIME); if (tm) rest = rest.replace(tm[0], ' ');
      const am = findAmounts(rest);
      if (SKIP.test(rest) && !am.length) { cur = null; continue; }
      let hint = 0; const w = rest.match(/\b(credit|debit|deposit|withdrawal|cr|dr|in|out)\b/i); if (w) hint = IN_WORD.test(w[1]) ? 1 : OUT_WORD.test(w[1]) ? -1 : 0;
      cur = { date: dt[0], time: tm ? time24(tm) : '', amts: am, pct: pct.bp, hint, note: cleanNote(am.reduce((s, a) => s.replace(a.text, ' '), rest)), skip: SKIP.test(rest) };
      rows.push(cur); continue;
    }
    if (!cur) continue;
    let rest = line;
    const pct = extractPct(rest); rest = pct.rest; if (pct.bp != null && cur.pct == null) cur.pct = pct.bp;
    const tm = rest.match(new RegExp('^\\s*' + TIME.source)); if (tm) { if (!cur.time) cur.time = time24(tm); rest = rest.replace(tm[0], ' '); }
    const am = findAmounts(rest);
    if (am.length && !cur.amts.length) { cur.amts = am; rest = am.reduce((s, a) => s.replace(a.text, ' '), rest); }
    else if (am.length) { cur = null; continue; }
    const extra = cleanNote(rest); if (extra && !/^(date|details|amount|balance|page|summary|totals?|statement)\b/i.test(extra) && cur.note.length < 120) cur.note = (cur.note ? cur.note + ' · ' : '') + extra;
  }
  const out = rows.filter(r => r.amts.length && !r.skip).map(r => {
    const a = r.amts[0], last = r.amts[r.amts.length - 1];
    return { date: r.date, time: r.time, note: r.note.slice(0, 200), amt: a.v, sign: a.sign, hint: a.hint || r.hint, bal: r.amts.length > 1 ? last.v * (last.sign || 1) : null, pct: r.pct, profit: null, comm: null };
  });
  out.ambiguous = amb; return out;
}

/* ---------- 2. tables (Excel / CSV): find the header row and map the columns ---------- */
const COLS = {
  date: /^(date|dt|txn date|tran date|transaction date|value date|தேதி|நாள்)$|date/i,
  time: /^(time|நேரம்)$/i,
  note: /details|description|narration|particulars|note|remarks|memo|விவரம்|குறிப்பு|^name$|party|from|to\b/i,
  inn: /^(in|cr|credit|credits|deposit|deposits|received|receipt|inward|money in|வரவு|credit amount|deposit amt\.?)$|credit|deposit|வரவு/i,
  out: /^(out|dr|debit|debits|withdrawal|withdrawals|paid|payment|outward|money out|செலவு|debit amount|withdrawal amt\.?)$|debit|withdraw|செலவு/i,
  amount: /^(amount|amt|தொகை|value|amount \(inr\)|amount\(₹\))$|amount|தொகை/i,
  type: /^(type|dr\/cr|cr\/dr|in\/out|direction|வகை|txn type)$/i,
  bal: /balance|^bal$|இருப்பு|closing/i,
  pct: /%|rate|percent|சதவீதம்/i,
  profit: /profit|லாபம்/i,
  comm: /commission|கமிஷன்|^comm/i
};
export function mapHeader(cells) {
  const m = {}; const used = new Set();
  const order = ['date', 'time', 'type', 'comm', 'pct', 'profit', 'bal', 'inn', 'out', 'amount', 'note'];
  for (const k of order) cells.forEach((c, i) => {
    const h = String(c || '').trim().toLowerCase(); if (!h || used.has(i) || m[k] != null) return;
    if (k === 'pct' && !/%|rate|percent|சதவீதம்/.test(h)) return;
    if (k === 'profit' && /%/.test(h)) { if (m.pct == null) { m.pct = i; used.add(i); } return; }
    if (k === 'comm' && COLS.comm.test(h) && /%|rate|percent/.test(h)) { m.commPct = i; used.add(i); return; }
    if (k === 'pct' && COLS.comm.test(h)) return;
    if (COLS[k].test(h)) { m[k] = i; used.add(i); }
  });
  return m;
}
export function parseTable(rows, mdy) {
  let hi = -1, map = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) { const m = mapHeader(rows[i]); if (m.date != null && (m.amount != null || m.inn != null || m.out != null)) { hi = i; map = m; break; } }
  if (!map) return null;
  const out = []; let amb = false;
  for (const r of rows.slice(hi + 1)) {
    const cell = k => map[k] != null ? String(r[map[k]] == null ? '' : r[map[k]]).trim() : '';
    const dt = findDate(cell('date'), mdy); if (!dt) continue; amb = amb || dt[2];
    const joined = r.join(' '); if (SKIP.test(cell('note')) && !cell('amount')) continue;
    let amt = 0, hint = 0, sign = 0;
    const vi = num(cell('inn')), vo = num(cell('out'));
    if (vi) { amt = Math.abs(vi); hint = 1; } else if (vo) { amt = Math.abs(vo); hint = -1; }
    else { const v = num(cell('amount')); amt = Math.abs(v); sign = v < 0 ? -1 : 0; const am = findAmounts(cell('amount')); if (am[0] && am[0].hint) hint = am[0].hint; }
    if (!amt) continue;
    const ty = cell('type'); if (ty) { if (IN_WORD.test(ty) || /credit|deposit|வரவு|^in\b/i.test(ty)) hint = 1; else if (OUT_WORD.test(ty) || /debit|withdraw|செலவு|^out\b/i.test(ty)) hint = -1; }
    const tm = (cell('time') || cell('date')).match(TIME);
    const pctTxt = cell('pct'), pct = pctTxt ? Math.round(Number(pctTxt.replace(/[^\d.]/g, '')) * 100) || null : null;
    const pr = cell('profit') ? Math.abs(num(cell('profit'))) || null : null;
    const cp = map.commPct != null ? Math.round(Number(String(r[map.commPct] || '').replace(/[^\d.]/g, '')) * 100) || null : null;
    const cm = cell('comm') ? Math.abs(num(cell('comm'))) || null : null;
    const note = cleanNote(map.note != null ? cell('note') : joined.replace(dt[1], ' ').replace(/[\d,.₹]+/g, ' ')).slice(0, 200);
    out.push({ date: dt[0], time: tm ? time24(tm) : '', note, amt, sign, hint, bal: cell('bal') ? num(cell('bal')) : null, pct, profit: pr, comm: cm, commPct: cp });
  }
  out.ambiguous = amb; out.columns = map; return out;
}
/** Direction for every row. 'auto': file columns / Cr-Dr / type first, then running balance, then sign, else In. */
export function directions(rows, mode) {
  let prev = null;
  return rows.map(r => {
    let d = mode === 'in' ? 1 : mode === 'out' ? -1 : 0;
    if (!d && r.hint) d = r.hint;
    if (!d && r.bal != null && prev != null) { const delta = r.bal - prev; d = delta === -r.amt ? -1 : delta === r.amt ? 1 : delta < 0 ? -1 : delta > 0 ? 1 : 0; }
    if (!d && r.sign) d = r.sign;
    if (!d && r.bal != null && prev == null && r.bal === -r.amt) d = -1;
    if (r.bal != null) prev = r.bal;
    return d || 1;
  });
}

/* ---------- reading files ---------- */
async function pdfLines(file) {
  const lib = await import('../../vendor/pdf.js');
  lib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.js', import.meta.url).href;
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= Math.min(doc.numPages, 80); p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || 8 }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of items) { const r = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2, it.h * 0.45)); if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] }); }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      let out = '', end = null;
      for (const it of r.items.sort((a, b) => a.x - b.x)) { const gap = end == null ? 0 : it.x - end; out += end == null ? it.s : gap < it.h * 0.18 ? it.s : gap < it.h * 1.2 ? ' ' + it.s : '   ' + it.s; end = it.x + it.w; }
      lines.push(out);
    }
  }
  return { lines };
}
function loadScript(src) { return new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(Error('load')); document.head.appendChild(s); }); }
const fmtCell = c => { if (c == null) return ''; if (c instanceof Date) return `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}${c.getHours() || c.getMinutes() ? ` ${pad(c.getHours())}:${pad(c.getMinutes())}` : ''}`; return String(c).trim(); };
async function sheetRows(file) {
  await loadScript(new URL('../../vendor/xlsx.full.min.js', import.meta.url).href);
  const wb = window.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  let rows = [];
  for (const name of wb.SheetNames.slice(0, 5)) rows = rows.concat(window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }).map(r => r.map(fmtCell)));
  return { rows };
}
function splitCsv(l, sep) { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); }
function textSource(text) {
  const lines = text.split(/\r?\n/);
  const sep = lines.slice(0, 20).some(l => l.includes('\t')) ? '\t' : lines.slice(0, 20).filter(l => l.split(',').length > 2).length > 2 ? ',' : null;
  return sep ? { rows: lines.map(l => splitCsv(l, sep)), lines } : { lines };
}
async function fileSource(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return pdfLines(file);
  if (/\.(xlsx|xls|ods)$/.test(n)) return sheetRows(file);
  return textSource(await file.text());
}
/** Source → rows: table columns when a header is found, otherwise statement lines. */
export function readSource(src, mdy) {
  if (src.rows) { const t = parseTable(src.rows, mdy); if (t && t.length) return t; return parseLines(src.rows.map(r => r.join('   ')), mdy); }
  return parseLines(src.lines, mdy);
}

/* ---------- the sheet ---------- */
export function importSheet(ctx, book, acc) {
  if (!book.canEdit || !acc || acc.locked) return toast(T('பார்க்க மட்டும் அனுமதி', 'View-only access'));
  openSheet(T('பதிவுகளை இறக்கு', 'Import entries') + ' · ' + acc.name, `
    <p class="lead-text">${T('PDF அறிக்கை, Excel அல்லது CSV கோப்பிலிருந்து பதிவுகளை இந்தக் கணக்கில் சேர்க்கலாம். பழைய Team Ledger PDF-ம் சரி.', 'Add entries to this account from a PDF statement, Excel or CSV file. Old Team Ledger PDFs work too.')}</p>
    <div class="menu imp-how"><div class="row"><span class="ic green">${ic('check', 18, 3)}</span><span class="tx"><b>${T('தானாகக் கண்டுபிடிக்கும்', 'Detected automatically')}</b><small>${T('தேதி, நேரம், விவரம், வரவு / செலவு, லாபம் %, கமிஷன் %, இருப்பு', 'Date, time, details, in / out, profit %, commission %, balance')}</small></span></div>
      <div class="row"><span class="ic">${ic('edit', 18)}</span><span class="tx"><b>${T('சேர்க்கும் முன் நீங்கள் மாற்றலாம்', 'You can change it before adding')}</b><small>${T('ஒவ்வொரு பதிவும் வரவா / செலவா, தொகை, தேதி, லாபம் எங்கிருந்து', 'In or out for each row, amount, date, where profit comes from')}</small></span></div></div>
    <button class="btn block mt12" data-e="imp-file">${ic('clip', 20)}${T('கோப்பைத் தேர்வு செய் (PDF / Excel / CSV)', 'Choose a file (PDF / Excel / CSV)')}</button>
    <details class="mt12"><summary class="muted">${T('அல்லது உரையை ஒட்டு', 'Or paste text')}</summary>
      <textarea class="input mt8" id="imp-text" rows="6" placeholder="2026-09-01  Transaction  ₹14,600.00"></textarea>
      <button class="btn ghost block mt8" data-e="imp-read">${T('படி', 'Read')}</button></details>
    <p class="form-error" role="alert" id="imp-err"></p>
    <p class="note">${T('எல்லாம் உங்கள் போனிலேயே படிக்கப்படும். எதுவும் வெளியே அனுப்பப்படாது.', 'Everything is read on your phone. Nothing is uploaded.')}</p>`);
  const err = m => { const e = $('#imp-err'); if (e) e.textContent = m; };
  const go = async (getSrc, name) => {
    err(T('படிக்கிறது…', 'Reading…'));
    try {
      const src = await getSrc(), rows = readSource(src, false);
      if (!rows.length) return err(T('இதில் தேதி + தொகை உள்ள பதிவு எதுவும் கிடைக்கவில்லை.', 'No rows with a date and an amount were found.'));
      preview(ctx, book, acc, src, rows, name);
    } catch (e) { console.warn(e); err(T('இந்தக் கோப்பைப் படிக்க முடியவில்லை.', 'Could not read this file.') + ' ' + (e && e.message || '')); }
  };
  $('#sheet-root [data-e=imp-file]').onclick = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.pdf,.xlsx,.xls,.ods,.csv,.tsv,.txt,application/pdf,text/csv,text/plain'; input.hidden = true; document.body.appendChild(input);
    input.onchange = () => { const f = input.files[0]; input.remove(); if (!f) return; if (f.size > 15 * 1024 * 1024) return err(T('கோப்பு மிகப் பெரியது (15 MB வரை)', 'File too large (max 15 MB)')); go(() => fileSource(f), f.name); };
    input.click();
  };
  $('#sheet-root [data-e=imp-read]').onclick = () => { const t = $('#imp-text').value; if (t.trim()) go(async () => textSource(t), T('ஒட்டிய உரை', 'Pasted text')); };
}
const SHOW = 150;
function preview(ctx, book, acc, src, rows0, name) {
  const have = new Set(book.entries.filter(e => e.acc === acc.id && !isSettle(e)).map(e => e.date + '|' + e.amt + '|' + e.dir));
  const st = { rows: rows0, mode: 'auto', mdy: false, flip: {}, sel: null, edit: null, more: false, showAll: false };
  const fileHasProfit = () => st.rows.some(r => r.pct != null || r.profit != null || r.comm != null || r.commPct != null);
  st.prof = fileHasProfit() ? 'file' : 'account';
  const calc = () => {
    const auto = directions(st.rows, st.mode);
    return st.rows.map((r, i) => {
      const dir = st.flip[i] ? -auto[i] : auto[i];
      let rate = null, cr = null;
      if (st.prof === 'none') { rate = 0; cr = 0; }
      else if (st.prof === 'file') { rate = r.pct != null ? r.pct : r.profit != null ? Math.round(r.profit * 10000 / r.amt) : null; cr = r.commPct != null ? r.commPct : r.comm != null ? Math.round(r.comm * 10000 / r.amt) : null; }
      const p = calcProfit(acc, r.amt, rate, cr, dir);
      return { ...r, dir, rate, commRate: cr, profit: p.profit, comm: p.comm, gross: p.gross, dup: have.has(r.date + '|' + r.amt + '|' + dir) };
    });
  };
  const draw = () => {
    const list = calc();
    if (!st.sel) st.sel = list.map(r => !r.dup);
    const pick = list.filter((r, i) => st.sel[i]);
    const sum = f => pick.reduce((n, r) => n + f(r), 0);
    const dupN = list.filter(r => r.dup).length, cols = st.rows.columns;
    const colTxt = cols ? Object.keys(cols).map(k => ({ date: T('தேதி', 'Date'), time: T('நேரம்', 'Time'), note: T('விவரம்', 'Details'), inn: T('வரவு', 'In'), out: T('செலவு', 'Out'), amount: T('தொகை', 'Amount'), type: T('வகை', 'Type'), bal: T('இருப்பு', 'Balance'), pct: T('லாபம் %', 'Profit %'), profit: T('லாபம்', 'Profit'), comm: T('கமிஷன்', 'Commission'), commPct: T('கமிஷன் %', 'Commission %') }[k])).filter(Boolean).join(' · ') : '';
    const seg = (key, opts) => `<div class="seg full imp-seg">${opts.map(([k, l]) => `<button class="${st[key] === k ? 'on' : ''}" data-e="imp-${key}" data-v="${k}">${l}</button>`).join('')}</div>`;
    const shown = st.showAll ? list : list.slice(0, SHOW);
    const body = `
      <p class="note mt0">${esc(name)} · ${TP('{n} பதிவுகள் கிடைத்தன', '{n} rows found', { n: list.length })}${dupN ? ' · ' + TP('{n} ஏற்கனவே உள்ளன (தவிர்க்கப்பட்டது)', '{n} already in this account (skipped)', { n: dupN }) : ''}</p>
      ${colTxt ? `<p class="note mt0">${ic('check', 14, 3)} ${T('கண்டுபிடித்த நெடுவரிசைகள்:', 'Columns found:')} ${esc(colTxt)}</p>` : ''}
      <div class="imp-opt"><small>${T('வரவு / செலவு', 'In / out')}</small>${seg('mode', [['auto', T('தானாக', 'Auto')], ['in', T('எல்லாம் வரவு', 'All in')], ['out', T('எல்லாம் செலவு', 'All out')]])}</div>
      <div class="imp-opt"><small>${T('லாபம், கமிஷன்', 'Profit and commission')}</small>${seg('prof', [...(fileHasProfit() ? [['file', T('கோப்பில் உள்ளபடி', 'From the file')]] : []), ['account', T('கணக்கின் %', 'Account %')], ['none', T('வேண்டாம்', 'None')]])}</div>
      ${st.rows.ambiguous ? `<div class="imp-opt"><small>${T('தேதி வடிவம் (03/04 = ?)', 'Date order (03/04 = ?)')}</small><div class="seg full imp-seg2"><button class="${!st.mdy ? 'on' : ''}" data-e="imp-mdy" data-v="0">${T('நாள் / மாதம்', 'Day / month')}</button><button class="${st.mdy ? 'on' : ''}" data-e="imp-mdy" data-v="1">${T('மாதம் / நாள்', 'Month / day')}</button></div></div>` : ''}
      <div class="imp-sum"><span><small>${T('வரவு', 'In')}</small><b class="in">${moneyAbs(sum(r => r.dir > 0 ? r.amt : 0))}</b></span><span><small>${T('செலவு', 'Out')}</small><b class="out">${moneyAbs(sum(r => r.dir < 0 ? r.amt : 0))}</b></span><span><small>${T('லாபம்', 'Profit')}</small><b>${money(sum(r => r.gross))}</b></span>${sum(r => r.comm) ? `<span><small>${T('கமிஷன்', 'Commission')}</small><b class="out">${money(sum(r => r.comm))}</b></span>` : ''}</div>
      <div class="imp-bar"><button class="link-btn" data-e="imp-all">${T('எல்லாம் தேர்வு', 'Select all')}</button><button class="link-btn" data-e="imp-none">${T('எதுவும் வேண்டாம்', 'Select none')}</button><span class="muted">${T('வரவு/செலவு மாற்ற தொகையைத் தொடவும்', 'Tap an amount to switch in / out')}</span></div>
      <div class="imp-list">${shown.map((r, i) => st.edit === i ? editRow(r, i) : `<div class="imp-row ${r.dup ? 'dup' : ''} ${st.sel[i] ? '' : 'off'}"><input type="checkbox" class="check24" data-i="${i}" ${st.sel[i] ? 'checked' : ''} aria-label="${T('சேர்', 'Add')}">
        <button class="d" data-e="imp-edit" data-i="${i}">${dmy(r.date)}${r.time ? `<small>${r.time}</small>` : ''}</button>
        <button class="n" data-e="imp-edit" data-i="${i}">${esc(r.note || '—')}${r.dup ? `<small>${T('ஏற்கனவே உள்ளது', 'Already there')}</small>` : r.gross || r.comm ? `<small>${T('லாபம்', 'Profit')} ${money(r.gross)}${r.rate != null && r.rate ? ' · ' + (r.rate / 100) + '%' : ''}${r.comm ? ' · ' + T('கமி.', 'Comm.') + ' ' + money(r.comm) : ''}</small>` : ''}</button>
        <button class="io ${r.dir > 0 ? 'in' : 'out'}" data-e="imp-flip" data-i="${i}"><small>${r.dir > 0 ? T('வரவு', 'In') : T('செலவு', 'Out')} ⇄</small><b class="num">${moneyAbs(r.amt)}</b></button></div>`).join('')}
        ${list.length > shown.length ? `<button class="btn ghost block" data-e="imp-showall">${TP('மீதமுள்ள {n} பதிவுகளையும் காட்டு', 'Show the other {n} rows', { n: list.length - shown.length })}</button>` : ''}</div>`;
    const scroll = $('#sheet-root .sheet .body') ? $('#sheet-root .sheet .body').scrollTop : 0;
    openSheet(T('சரிபார்த்து சேர்', 'Check and add') + ' · ' + acc.name, body, `<button class="btn block" id="imp-go" ${pick.length ? '' : 'disabled'}>${ic('check', 20, 3)}${TP('{n} பதிவுகளைச் சேர்', 'Add {n} entries', { n: pick.length })}</button>`, { tall: true });
    const root = $('#sheet-root'); root.querySelector('.sheet').classList.add('show'); const sc = root.querySelector('.scrim'); if (sc) sc.classList.add('show');
    root.querySelector('.sheet .body').scrollTop = scroll;
    const on = (sel, fn) => root.querySelectorAll(sel).forEach(b => b.onclick = () => fn(b));
    on('[data-e=imp-mode]', b => { st.mode = b.dataset.v; st.flip = {}; st.sel = null; draw(); });
    on('[data-e=imp-prof]', b => { st.prof = b.dataset.v; draw(); });
    on('[data-e=imp-mdy]', b => { st.mdy = b.dataset.v === '1'; st.rows = readSource(src, st.mdy); st.flip = {}; st.sel = null; st.edit = null; draw(); });
    on('[data-e=imp-all]', () => { st.sel = list.map(() => true); draw(); });
    on('[data-e=imp-none]', () => { st.sel = list.map(() => false); draw(); });
    on('[data-e=imp-flip]', b => { const i = +b.dataset.i; st.flip[i] = !st.flip[i]; draw(); });
    on('[data-e=imp-edit]', b => { st.edit = +b.dataset.i; draw(); });
    on('[data-e=imp-showall]', () => { st.showAll = true; draw(); });
    on('[data-e=imp-edit-done]', b => {
      const i = +b.dataset.i, r = st.rows[i], g = id => root.querySelector('#' + id);
      const amt = Math.round(Number(String(g('ie-amt').value).replace(/,/g, '')) * 100);
      if (amt > 0) r.amt = amt;
      if (g('ie-date').value) r.date = g('ie-date').value;
      r.time = g('ie-time').value || r.time; r.note = g('ie-note').value.trim().slice(0, 200);
      const pv = g('ie-pct').value.trim(); r.pct = pv === '' ? null : Math.round(Number(pv) * 100); r.profit = null;
      const cv = g('ie-comm').value.trim(); r.commPct = cv === '' ? null : Math.round(Number(cv) * 100); r.comm = null;
      if (r.pct != null || r.commPct != null) st.prof = 'file';
      const want = g('ie-dir').value === 'in' ? 1 : -1, auto = directions(st.rows, st.mode)[i]; st.flip[i] = want !== auto;
      st.sel[i] = true; st.edit = null; draw();
    });
    on('[data-e=imp-edit-cancel]', () => { st.edit = null; draw(); });
    root.querySelector('.imp-list').onchange = e => { const i = e.target.dataset.i; if (i != null && e.target.type === 'checkbox') { st.sel[i] = e.target.checked; draw(); } };
    $('#imp-go').onclick = async () => {
      const b = $('#imp-go'); b.disabled = true;
      const batch = 'imp-' + uid().slice(0, 12), now = Date.now();
      const recs = list.filter((r, i) => st.sel[i]).map((r, i) => ({ id: uid(), acc: acc.id, dir: r.dir, amt: r.amt, date: r.date, time: r.time || '00:00', note: r.note || '', party: '', cat: '', rate: r.rate, commRate: r.commRate, profit: r.profit, comm: r.comm, files: [], created: now + i, imp: { batchId: batch, fileName: String(name).slice(0, 120) } }));
      try {
        await book.putEntries(recs);
        closeSheet(); ctx.render();
        toast(TP('{n} பதிவுகள் சேர்ந்தன', '{n} entries added', { n: recs.length }), { label: T('திரும்பப் பெறு', 'Undo'), fn: async () => { await book.deleteEntries(recs.map(r => r.id)); ctx.render(); toast(T('நீக்கப்பட்டது', 'Removed')); } });
      } catch (e) { b.disabled = false; toast(T('சேமிக்க முடியவில்லை', 'Could not save') + ' ' + (e.message || '')); }
    };
  };
  const editRow = (r, i) => `<div class="imp-edit card">
      <div class="row2"><div class="field"><label for="ie-date">${T('தேதி', 'Date')}</label><input class="input" type="date" id="ie-date" value="${esc(r.date)}"></div><div class="field"><label for="ie-time">${T('நேரம்', 'Time')}</label><input class="input" type="time" id="ie-time" value="${esc(r.time || '')}"></div></div>
      <div class="row2"><div class="field"><label for="ie-amt">${T('தொகை ₹', 'Amount ₹')}</label><input class="input" id="ie-amt" inputmode="decimal" value="${(r.amt / 100).toFixed(2)}"></div><div class="field"><label for="ie-dir">${T('வகை', 'Type')}</label><select class="input" id="ie-dir"><option value="in" ${r.dir > 0 ? 'selected' : ''}>${T('வரவு', 'In')}</option><option value="out" ${r.dir < 0 ? 'selected' : ''}>${T('செலவு', 'Out')}</option></select></div></div>
      <div class="field"><label for="ie-note">${T('விவரம்', 'Details')}</label><input class="input" id="ie-note" value="${esc(r.note || '')}"></div>
      <div class="row2"><div class="field"><label for="ie-pct">${T('லாபம் % (விருப்பம்)', 'Profit % (optional)')}</label><input class="input" id="ie-pct" inputmode="decimal" value="${r.pct != null ? r.pct / 100 : r.profit != null ? +(r.profit * 100 / r.amt).toFixed(2) : ''}"></div><div class="field"><label for="ie-comm">${T('கமிஷன் % (விருப்பம்)', 'Commission % (optional)')}</label><input class="input" id="ie-comm" inputmode="decimal" value="${r.commPct != null ? r.commPct / 100 : r.comm != null ? +(r.comm * 100 / r.amt).toFixed(2) : ''}"></div></div>
      <div class="row2"><button class="btn ghost" data-e="imp-edit-cancel">${T('வேண்டாம்', 'Cancel')}</button><button class="btn" data-e="imp-edit-done" data-i="${i}">${ic('check', 18, 3)}${T('சரி', 'OK')}</button></div></div>`;
  draw();
}
