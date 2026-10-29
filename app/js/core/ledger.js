/* Ledger arithmetic. All money is integer paise; rates are basis points (200 = 2%). */
export const counts = e => !e.noBal && !e.pending;
/** A settlement takes money out of the profit (old app: account.settlements). Never touches the balance. */
export const isSettle = e => e.kind === 'settle' || (e.imported && e.cat === 'Settled' && String(e.id).startsWith('settle-'));
export const sortEntries = list => list.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || (a.created || 0) - (b.created || 0) || String(a.id).localeCompare(String(b.id)));

export function accountTotals(book, acc, from, to) {
  const list = sortEntries(book.entries.filter(e => e.acc === acc.id));
  let bal = acc.opening || 0, open = bal, inn = 0, out = 0, profit = 0, comm = 0, paid = 0, settled = 0, gIn = 0, gOut = 0, cIn = 0, cOut = 0;
  const rows = [];
  for (const e of list) {
    if (to && e.date > to) continue;
    if (isSettle(e)) { if (!(from && e.date < from)) { settled += e.amt; rows.push({ e, bal }); } continue; }
    if (counts(e)) bal += e.dir * e.amt;
    if (from && e.date < from) { open = bal; continue; }
    if (counts(e)) { if (e.dir > 0) inn += e.amt; else out += e.amt; }
    profit += e.profit || 0; comm += e.comm || 0; paid += e.commPaid || 0;
    if (e.dir > 0) { gIn += (e.profit || 0) + (e.comm || 0); cIn += e.comm || 0; } else { gOut += (e.profit || 0) + (e.comm || 0); cOut += e.comm || 0; }
    rows.push({ e, bal });
  }
  if (!from) open = acc.opening || 0;
  return { open, inn, out, bal, profit, comm, paid, settled, inHand: profit - settled, gross: profit + comm, gIn, gOut, cIn, cOut, due: comm - paid, rows, last: list.length ? list[list.length - 1].date : '' };
}
export function allTotals(book, from, to, accIds) {
  const t = { open: 0, inn: 0, out: 0, bal: 0, profit: 0, comm: 0, paid: 0, settled: 0, gIn: 0, gOut: 0, cIn: 0, cOut: 0 };
  for (const a of book.accounts) {
    if (accIds && !accIds.includes(a.id)) continue;
    const x = accountTotals(book, a, from, to);
    for (const k of ['open', 'gIn', 'gOut', 'cIn', 'cOut']) t[k] += x[k];
    t.inn += x.inn; t.out += x.out; t.bal += x.bal; t.profit += x.profit; t.comm += x.comm; t.paid += x.paid; t.settled += x.settled;
  }
  t.gross = t.profit + t.comm; t.inHand = t.profit - t.settled; t.due = t.comm - t.paid;
  return t;
}
/* Account rates, exactly like the old Team Ledger finance block:
   in / out profit % and in / out payable commission %. Older records keep a single rate. */
export const RATE_KEYS = ['inProfit', 'outProfit', 'inComm', 'outComm'];
export function accRates(acc) {
  if (!acc) return { inProfit: 0, outProfit: 0, inComm: 0, outComm: 0 };
  if (acc.fin) return { inProfit: acc.fin.inProfit || 0, outProfit: acc.fin.outProfit || 0, inComm: acc.fin.inComm || 0, outComm: acc.fin.outComm || 0 };
  return { inProfit: acc.rate || 0, outProfit: acc.rate || 0, inComm: acc.commRate || 0, outComm: acc.commRate || 0 };
}
export const hasRates = acc => { const r = accRates(acc); return RATE_KEYS.some(k => r[k] > 0); };
export function dirRates(acc, dir) { const r = accRates(acc); return dir < 0 ? { rate: r.outProfit, comm: r.outComm } : { rate: r.inProfit, comm: r.inComm }; }
/** Profit for one entry: gross = amount × profit %, comm = amount × payable commission %, profit = gross − comm. */
export function calcProfit(acc, amt, rate, commRate, dir) {
  const d = dirRates(acc, dir || 1);
  const r = rate != null ? rate : d.rate, c = commRate != null ? commRate : d.comm;
  const gross = Math.round(amt * r / 1e4), cm = Math.round(amt * c / 1e4);
  return { profit: gross - cm, comm: cm, gross };
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
