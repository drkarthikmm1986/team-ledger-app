import {validatePersonal} from './personal-model.js';
export const emptyLedger = () => ({ version: 1, accounts: [], entries: [], holds: [], types: [] });
export const uid = () => crypto.randomUUID();
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const clock = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const formatMoney = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
export const money = n => formatMoney.format(n / 100);
export function amount(text, allowZero = false) {
  const s = String(text).trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) throw Error('Enter an amount with at most two decimal places / தொகையைச் சரிபாருங்கள்');
  const [whole, fraction = ''] = s.split('.'), n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if ((!allowZero && n === 0) || n > 1e12) throw Error('Invalid amount / தவறான தொகை');
  return n;
}
export function rate(text) { const n = amount(text || '0', true); if (n > 10000) throw Error('Percentage must be 0–100'); return n; }
const safe = n => Number.isSafeInteger(n) && Math.abs(n) <= 1e12;
const dateOK = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const nameOK = s => typeof s === 'string' && s.trim().length > 0 && s.length <= 80;
export function validateLedger(d) {
  if(d?.personal)validatePersonal(d.personal);
  if (d?.version !== 1 || !['accounts', 'entries', 'holds', 'types'].every(k => Array.isArray(d[k]))) throw Error('Invalid ledger');
  if (d.accounts.length > 100 || d.entries.length > 10000 || d.holds.length > 2000 || d.types.length > 100) throw Error('Ledger limit reached');
  for (const collection of [d.accounts, d.entries, d.holds]) if (new Set(collection.map(x => x.id)).size !== collection.length || collection.some(x => typeof x.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(x.id))) throw Error('Invalid record identity');
  if (!d.accounts.every(a => nameOK(a.name) && safe(a.opening) && Number.isInteger(a.rate) && a.rate >= 0 && a.rate <= 10000)) throw Error('Invalid account');
  const ids = new Set(d.accounts.map(a => a.id));
  let attachmentBytes = 0;
  for (const e of d.entries) {
    if (!ids.has(e.accountId) || !safe(e.amount) || e.amount <= 0 || ![1, -1].includes(e.effect) || !dateOK(e.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time) || typeof e.type !== 'string' || e.type.length > 80 || typeof e.note !== 'string' || e.note.length > 2000 || !(e.rate === null || Number.isInteger(e.rate) && e.rate >= 0 && e.rate <= 10000) || !Array.isArray(e.files) || e.files.length > 5) throw Error('Invalid entry');
    for (const f of e.files) {
      if (!nameOK(f.name) || typeof f.mime !== 'string' || f.mime.length > 100 || typeof f.data !== 'string' || f.data.length > 6990508 || !/^[A-Za-z0-9+/]*={0,2}$/.test(f.data) || f.data.length % 4 !== 0) throw Error('Invalid attachment');
      attachmentBytes += f.data.length;
    }
  }
  if (attachmentBytes > 30 * 1024 * 1024) throw Error('Attachments are too large for this group (22 MB total)');
  for (const h of d.holds) if (!ids.has(h.accountId) || !nameOK(h.name) || !safe(h.amount) || h.amount <= 0 || !dateOK(h.date) || ![1, -1].includes(h.effect) || typeof h.included !== 'boolean' || typeof h.done !== 'boolean') throw Error('Invalid hold');
  if (!d.types.every(nameOK)) throw Error('Invalid transaction types');
  const exposure = [...d.entries.map(e => e.amount), ...d.holds.map(h => h.amount), ...d.accounts.map(a => Math.abs(a.opening))].reduce((s, n) => s + BigInt(n), 0n);
  if (exposure > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Total exceeds supported exact monetary range');
  return d;
}
export function summary(d, accountId, from = '', to = '') {
  const account = d.accounts.find(a => a.id === accountId);
  if (!account) throw Error('Account not found');
  let balance = account.opening, opening = account.opening, received = 0, paid = 0, profit = 0;
  const entries = d.entries.filter(e => e.accountId === accountId).map(e => ({ ...e, hold: false }));
  entries.push(...d.holds.filter(h => h.accountId === accountId && h.included && !h.done).map(h => ({ ...h, time: '00:00', type: h.name, note: 'Hold / ஹோல்டு', files: [], rate: 0, hold: true })));
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  const rows = [];
  for (const e of entries) {
    const change = e.effect * e.amount;
    if (from && e.date < from) { opening += change; balance += change; continue; }
    if (to && e.date > to) continue;
    balance += change;
    if (e.effect === 1) received += e.amount; else paid += e.amount;
    const calculated = Number((BigInt(e.amount) * BigInt(e.rate ?? account.rate) + 5000n) / 10000n);
    profit += calculated;
    rows.push({ ...e, balance, profit: calculated });
  }
  return { opening, balance, received, paid, profit, rows };
}
