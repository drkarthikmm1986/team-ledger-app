/* Ledger arithmetic. All money is integer paise; rates are basis points (200 = 2%). */
export const counts = e => !e.noBal && !e.pending;
export const sortEntries = list => list.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || (a.created || 0) - (b.created || 0) || String(a.id).localeCompare(String(b.id)));

export function accountTotals(book, acc, from, to) {
  const list = sortEntries(book.entries.filter(e => e.acc === acc.id));
  let bal = acc.opening || 0, open = bal, inn = 0, out = 0, profit = 0, comm = 0;
  const rows = [];
  for (const e of list) {
    if (to && e.date > to) continue;
    if (counts(e)) bal += e.dir * e.amt;
    if (from && e.date < from) { open = bal; continue; }
    if (counts(e)) { if (e.dir > 0) inn += e.amt; else out += e.amt; }
    profit += e.profit || 0; comm += e.comm || 0;
    rows.push({ e, bal });
  }
  if (!from) open = acc.opening || 0;
  return { open, inn, out, bal, profit, comm, rows, last: list.length ? list[list.length - 1].date : '' };
}
export function allTotals(book, from, to, accIds) {
  const t = { inn: 0, out: 0, bal: 0, profit: 0, comm: 0 };
  for (const a of book.accounts) {
    if (accIds && !accIds.includes(a.id)) continue;
    const x = accountTotals(book, a, from, to);
    t.inn += x.inn; t.out += x.out; t.bal += x.bal; t.profit += x.profit; t.comm += x.comm;
  }
  return t;
}
export function calcProfit(acc, amt, rate, commRate) {
  const r = rate != null ? rate : (acc && acc.rate) || 0;
  const c = commRate != null ? commRate : (acc && acc.commRate) || 0;
  const gross = Math.round(amt * r / 1e4), cm = Math.round(amt * c / 1e4);
  return { profit: gross - cm, comm: cm };
}
/** Parse a keypad expression like "120+80+45" into paise. */
export function exprToPaise(expr) {
  const parts = String(expr || '').split('+').filter(Boolean);
  let total = 0;
  for (const p of parts) { const v = Number(p); if (!Number.isFinite(v)) return NaN; total += Math.round(v * 100); }
  return total;
}
export function suggestNotes(book, accId, dir) {
  const c = new Map();
  for (const e of book.entries) if (e.note && e.dir === dir && (!accId || e.acc === accId) && e.note.length <= 30) c.set(e.note, (c.get(e.note) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
}
