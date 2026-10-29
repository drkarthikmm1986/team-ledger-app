/* Import entries into one account from a statement: PDF (old Team Ledger / bank), Excel, CSV or pasted text.
   Everything runs on the phone; nothing is uploaded. Preview → untick wrong rows → add. Undo is offered. */
import { $, esc, T, TP, ic, money, moneyAbs, uid, dmy } from '../core/util.js';
import { calcProfit, dirRates, isSettle } from '../core/ledger.js';
import { toast, openSheet, closeSheet } from '../ui/kit.js';

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
const year = y => (y = Number(y), y < 100 ? 2000 + y : y);
const okDate = (y, m, d) => y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null;
/** First date in a line → [iso, matchedText] */
export function findDate(s) {
  let m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) { const d = okDate(+m[1], +m[2], +m[3]); if (d) return [d, m[0]]; }
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) { const d = okDate(year(m[3]), +m[2], +m[1]); if (d) return [d, m[0]]; }
  m = s.match(/\b(\d{1,2})[\s-]*([A-Za-z]{3,9})[\s,-]*(\d{2,4})\b/);
  if (m && MON[m[2].toLowerCase().slice(0, m[2].length > 4 ? 3 : 4)] ) { const d = okDate(year(m[3]), MON[m[2].toLowerCase().slice(0, m[2].length > 4 ? 3 : 4)] || MON[m[2].toLowerCase().slice(0, 3)], +m[1]); if (d) return [d, m[0]]; }
  return null;
}
const AMT = /(?:([−–-])\s*)?(?:₹|Rs\.?|INR)?\s*(\()?(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|(?<=₹\s?)\d+)(\))?(?:\s*(Cr|Dr|CR|DR)\b)?/g;
/** Amounts in a line (paise, signed when the text shows a sign). */
export function findAmounts(s) {
  const out = []; let m; AMT.lastIndex = 0;
  while ((m = AMT.exec(s))) {
    const v = Math.round(Number(m[3].replace(/,/g, '')) * 100); if (!v) continue;
    const neg = !!m[1] || (!!m[2] && !!m[4]) || /dr/i.test(m[5] || ''), pos = /cr/i.test(m[5] || '');
    out.push({ v, sign: neg ? -1 : pos ? 1 : 0, text: m[0] });
  }
  return out;
}
const SKIP = /\b(total|grand total|opening|closing|balance as of|as of|balance b\/f|brought forward|carried forward)\b|மொத்தம்|தொடக்க இருப்பு|முடிவு இருப்பு/i;
/** Lines of text → statement rows. Each row starts with a line holding a date; lines below it add time, % and notes. */
export function parseLines(lines) {
  const rows = []; let cur = null;
  for (let raw of lines) {
    const line = String(raw || '').replace(/\s+/g, ' ').trim(); if (!line) continue;
    const dt = findDate(line);
    if (dt) {
      let rest = line.replace(dt[1], ' ');
      const pct = extractPct(rest); rest = pct.rest;
      const tm = rest.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::\d\d)?\s*(AM|PM|am|pm)?\b/);
      if (tm) rest = rest.replace(tm[0], ' ');
      const am = findAmounts(rest);
      if (SKIP.test(rest) && !am.length) { cur = null; continue; }
      cur = { date: dt[0], time: tm ? time24(tm) : '', amts: am, pct: pct.bp, note: cleanNote(am.reduce((s, a) => s.replace(a.text, ' '), rest)), skip: SKIP.test(rest) };
      rows.push(cur); continue;
    }
    if (!cur) continue;
    let rest = line;
    const pct = extractPct(rest); rest = pct.rest; if (pct.bp != null && cur.pct == null) cur.pct = pct.bp;
    const tm = rest.match(/^\s*([01]?\d|2[0-3]):([0-5]\d)(?::\d\d)?\s*(AM|PM|am|pm)?\b/);
    if (tm) { if (!cur.time) cur.time = time24(tm); rest = rest.replace(tm[0], ' '); }
    const am = findAmounts(rest);
    if (am.length && !cur.amts.length) { cur.amts = am; rest = am.reduce((s, a) => s.replace(a.text, ' '), rest); }
    else if (am.length) { cur = null; continue; } // a different block (totals, page footer)
    const extra = cleanNote(rest); if (extra && !/^(date|details|amount|balance|page|summary|totals?|statement)\b/i.test(extra) && cur.note.length < 120) cur.note = (cur.note ? cur.note + ' · ' : '') + extra;
  }
  return rows.filter(r => r.amts.length && !r.skip).map(r => ({ date: r.date, time: r.time, note: r.note.slice(0, 200), amt: r.amts[0].v, sign: r.amts[0].sign, bal: r.amts.length > 1 ? r.amts[r.amts.length - 1].v * (r.amts[r.amts.length - 1].sign || 1) : null, pct: r.pct }));
}
function extractPct(s) {
  const m = s.match(/(\d+(?:\.\d+)?)\s*%(?:\s*\((?:₹|Rs\.?)?\s*[\d,]+(?:\.\d+)?\))?/);
  return m ? { bp: Math.round(Number(m[1]) * 100), rest: s.replace(m[0], ' ') } : { bp: null, rest: s };
}
const time24 = m => { let h = +m[1]; const ap = (m[3] || '').toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; return pad(h) + ':' + m[2]; };
const cleanNote = s => s.replace(/[·•|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g, '').trim();
/** Direction for every row: 'auto' uses the running balance, then the sign, else money in. */
export function directions(rows, mode) {
  let prev = null;
  return rows.map(r => {
    let d = mode === 'in' ? 1 : mode === 'out' ? -1 : 0;
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
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || 8 }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of items) { const r = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2, it.h * 0.45)); if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] }); }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      // glue pieces of one word / number back together; keep real gaps between columns
      let out = '', end = null;
      for (const it of r.items.sort((a, b) => a.x - b.x)) { const gap = end == null ? 0 : it.x - end; out += end == null ? it.s : gap < it.h * 0.18 ? it.s : gap < it.h * 1.2 ? ' ' + it.s : '   ' + it.s; end = it.x + it.w; }
      lines.push(out);
    }
  }
  return lines;
}
function loadScript(src) { return new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(Error('load')); document.head.appendChild(s); }); }
async function sheetLines(file) {
  await loadScript(new URL('../../vendor/xlsx.full.min.js', import.meta.url).href);
  const wb = window.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  const lines = [];
  for (const name of wb.SheetNames.slice(0, 5)) for (const row of window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })) lines.push(row.map(c => fmtCell(c)).join('   '));
  return lines;
}
const fmtCell = c => { if (c == null) return ''; const s = String(c).trim(); return /^-?\d+(\.\d+)?$/.test(s) && !/^\d{4,8}$/.test(s) ? (s.startsWith('-') ? '-' : '') + Number(s.replace('-', '')).toFixed(2) : s; };
async function fileLines(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return pdfLines(file);
  if (/\.(xlsx|xls|ods)$/.test(n)) return sheetLines(file);
  const text = await file.text();
  return text.split(/\r?\n/).map(l => l.includes('\t') || /","|",|,"/.test(l) || (l.split(',').length > 3) ? splitCsv(l).map(fmtCell).join('   ') : l);
}
function splitCsv(l) { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if ((ch === ',' || ch === '\t') && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }

/* ---------- the sheet ---------- */
export function importSheet(ctx, book, acc) {
  if (!book.canEdit || !acc || acc.locked) return toast(T('பார்க்க மட்டும் அனுமதி', 'View-only access'));
  openSheet(T('பதிவுகளை இறக்கு', 'Import entries') + ' · ' + acc.name, `
    <p class="lead-text">${T('PDF அறிக்கை, Excel அல்லது CSV கோப்பிலிருந்து பதிவுகளை இந்தக் கணக்கில் சேர்க்கலாம். பழைய Team Ledger PDF-ம் சரி.', 'Add entries to this account from a PDF statement, Excel or CSV file. Old Team Ledger PDFs work too.')}</p>
    <button class="btn block" data-e="imp-file">${ic('clip', 20)}${T('கோப்பைத் தேர்வு செய் (PDF / Excel / CSV)', 'Choose a file (PDF / Excel / CSV)')}</button>
    <details class="mt12"><summary class="muted">${T('அல்லது உரையை ஒட்டு', 'Or paste text')}</summary>
      <textarea class="input mt8" id="imp-text" rows="6" placeholder="2026-09-01  Transaction  ₹14,600.00"></textarea>
      <button class="btn ghost block mt8" data-e="imp-read">${T('படி', 'Read')}</button></details>
    <p class="form-error" role="alert" id="imp-err"></p>
    <p class="note">${T('எல்லாம் உங்கள் போனிலேயே படிக்கப்படும். எதுவும் வெளியே அனுப்பப்படாது.', 'Everything is read on your phone. Nothing is uploaded.')}</p>`);
  const err = m => { const e = $('#imp-err'); if (e) e.textContent = m; };
  const go = async (getLines, name) => {
    err(T('படிக்கிறது…', 'Reading…'));
    try {
      const rows = parseLines(await getLines());
      if (!rows.length) return err(T('இதில் தேதி + தொகை உள்ள பதிவு எதுவும் கிடைக்கவில்லை.', 'No rows with a date and an amount were found.'));
      preview(ctx, book, acc, rows, name);
    } catch (e) { console.warn(e); err(T('இந்தக் கோப்பைப் படிக்க முடியவில்லை.', 'Could not read this file.') + ' ' + (e && e.message || '')); }
  };
  $('#sheet-root [data-e=imp-file]').onclick = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.pdf,.xlsx,.xls,.ods,.csv,.tsv,.txt,application/pdf,text/csv,text/plain'; input.hidden = true; document.body.appendChild(input);
    input.onchange = () => { const f = input.files[0]; input.remove(); if (!f) return; if (f.size > 15 * 1024 * 1024) return err(T('கோப்பு மிகப் பெரியது (15 MB வரை)', 'File too large (max 15 MB)')); go(() => fileLines(f), f.name); };
    input.click();
  };
  $('#sheet-root [data-e=imp-read]').onclick = () => { const t = $('#imp-text').value; if (t.trim()) go(async () => t.split(/\r?\n/), T('ஒட்டிய உரை', 'Pasted text')); };
}
function preview(ctx, book, acc, rows, name) {
  const have = new Set(book.entries.filter(e => e.acc === acc.id && !isSettle(e)).map(e => e.date + '|' + e.amt + '|' + e.dir));
  const st = { mode: 'auto', usePct: rows.some(r => r.pct != null), sel: rows.map(() => true), dup: [] };
  const anyPct = rows.some(r => r.pct != null);
  const calc = () => {
    const dirs = directions(rows, st.mode);
    st.dup = rows.map((r, i) => have.has(r.date + '|' + r.amt + '|' + dirs[i]));
    return rows.map((r, i) => {
      const rate = st.usePct && r.pct != null ? r.pct : null;
      const p = calcProfit(acc, r.amt, rate, null, dirs[i]);
      return { ...r, dir: dirs[i], rate, profit: p.profit, comm: p.comm, gross: p.gross };
    });
  };
  let first = true;
  const draw = () => {
    const list = calc();
    if (first) { st.sel = st.dup.map(d => !d); first = false; }
    const pick = list.filter((r, i) => st.sel[i]);
    const sum = k => pick.reduce((n, r) => n + (k === 'in' ? (r.dir > 0 ? r.amt : 0) : k === 'out' ? (r.dir < 0 ? r.amt : 0) : r.gross), 0);
    const dupN = st.dup.filter(Boolean).length;
    const body = `
      <p class="note mt0">${esc(name)} · ${TP('{n} பதிவுகள் கிடைத்தன', '{n} rows found', { n: rows.length })}${dupN ? ' · ' + TP('{n} ஏற்கனவே உள்ளன (தவிர்க்கப்பட்டது)', '{n} already in this account (skipped)', { n: dupN }) : ''}</p>
      <div class="seg full imp-seg">${[['auto', T('தானாக', 'Auto')], ['in', T('எல்லாம் வரவு', 'All in')], ['out', T('எல்லாம் செலவு', 'All out')]].map(([k, l]) => `<button class="${st.mode === k ? 'on' : ''}" data-e="imp-mode" data-v="${k}">${l}</button>`).join('')}</div>
      ${anyPct ? `<label class="row card rounded mt8"><span class="tx"><b>${T('கோப்பில் உள்ள % ஐ லாபமாக எடு', 'Use the % in the file as profit')}</b><small>${T('இல்லையெனில் கணக்கின் % பயன்படும்', 'Otherwise the account % is used')}</small></span><input type="checkbox" class="check24" data-e="imp-pct" ${st.usePct ? 'checked' : ''}></label>` : ''}
      <div class="imp-sum"><span class="in">+${moneyAbs(sum('in'))}</span><span class="out">−${moneyAbs(sum('out'))}</span>${sum('p') ? `<span>${T('லாபம்', 'Profit')} ${money(sum('p'))}</span>` : ''}</div>
      <div class="imp-list">${list.map((r, i) => `<label class="imp-row ${st.dup[i] ? 'dup' : ''}"><input type="checkbox" class="check24" data-i="${i}" ${st.sel[i] ? 'checked' : ''}>
        <span class="d">${dmy(r.date)}${r.time ? `<small>${r.time}</small>` : ''}</span><span class="n">${esc(r.note || '—')}${st.dup[i] ? `<small>${T('ஏற்கனவே உள்ளது', 'Already there')}</small>` : r.gross ? `<small>${T('லாபம்', 'Profit')} ${money(r.gross)}${r.rate != null ? ' · ' + (r.rate / 100) + '%' : ''}</small>` : ''}</span>
        <b class="num ${r.dir > 0 ? 'in' : 'out'}">${r.dir > 0 ? '+' : '−'}${moneyAbs(r.amt)}</b></label>`).join('')}</div>`;
    openSheet(T('சரிபார்த்து சேர்', 'Check and add') + ' · ' + acc.name, body, `<button class="btn block" id="imp-go" ${pick.length ? '' : 'disabled'}>${ic('check', 20, 3)}${TP('{n} பதிவுகளைச் சேர்', 'Add {n} entries', { n: pick.length })}</button>`);
    const root = $('#sheet-root');
    root.querySelectorAll('[data-e=imp-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.v; first = true; draw(); });
    const pc = root.querySelector('[data-e=imp-pct]'); if (pc) pc.onchange = () => { st.usePct = pc.checked; draw(); };
    root.querySelector('.imp-list').onchange = e => { const i = e.target.dataset.i; if (i != null) { st.sel[i] = e.target.checked; draw(); } };
    $('#imp-go').onclick = async () => {
      const b = $('#imp-go'); b.disabled = true;
      const batch = 'imp-' + uid().slice(0, 12), now = Date.now();
      const recs = list.filter((r, i) => st.sel[i]).map((r, i) => ({ id: uid(), acc: acc.id, dir: r.dir, amt: r.amt, date: r.date, time: r.time || '00:00', note: r.note || '', party: '', cat: '', rate: r.rate, commRate: null, profit: r.profit, comm: r.comm, files: [], created: now + i, imp: { batchId: batch, fileName: String(name).slice(0, 120) } }));
      try {
        await book.putEntries(recs);
        closeSheet(); ctx.render();
        toast(TP('{n} பதிவுகள் சேர்ந்தன', '{n} entries added', { n: recs.length }), { label: T('திரும்பப் பெறு', 'Undo'), fn: async () => { await book.deleteEntries(recs.map(r => r.id)); ctx.render(); toast(T('நீக்கப்பட்டது', 'Removed')); } });
      } catch (e) { b.disabled = false; toast(T('சேமிக்க முடியவில்லை', 'Could not save') + ' ' + (e.message || '')); }
    };
  };
  draw();
}
