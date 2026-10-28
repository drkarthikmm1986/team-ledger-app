/* Backup and restore of the personal book (new format and old Team Ledger v3 backups). */
import { convert, isOldBackup } from '../core/import-old.js';
import { validateEnvelope } from '../core/vault.js';
import { fileAll, filePut } from './db.js';
import { uid, today } from '../core/util.js';

export async function makeBackup(book) {
  await book.flush();
  const files = await fileAll().catch(() => ({}));
  return { name: 'Team-Ledger-Backup-' + today() + '.json', text: JSON.stringify({ app: 'team-ledger', format: 4, saved: new Date().toISOString(), ledger: book.ledger, files }) };
}
export function validateLedger(l) {
  if (!l || !Array.isArray(l.accounts) || !Array.isArray(l.entries)) throw Error('bad');
  const ids = new Set();
  for (const a of l.accounts) { if (!a.id || typeof a.name !== 'string' || ids.has(a.id)) throw Error('acc'); ids.add(a.id); if (!Number.isSafeInteger(a.opening || 0)) throw Error('open'); }
  for (const e of l.entries) { if (!ids.has(e.acc) || !Number.isSafeInteger(e.amt) || ![1, -1].includes(e.dir) || !/^\d{4}-\d\d-\d\d$/.test(e.date)) throw Error('entry'); e.files = Array.isArray(e.files) ? e.files : []; }
  if (l.vault) validateEnvelope(l.vault);
  return l;
}
/** Parse a backup text. Returns { ledger, files, report, old } or throws. */
export function parseBackup(text) {
  const d = JSON.parse(text);
  if (d && d.app === 'team-ledger' && d.ledger && Array.isArray(d.ledger.accounts)) return { ledger: validateLedger(d.ledger), files: d.files || {}, old: false };
  if (isOldBackup(d)) {
    const c = convert(d, uid);
    const ledger = { app: 'team-ledger', version: 1, accounts: c.accounts, entries: c.entries, created: Date.now(), importedFrom: 'v3' };
    if (c.vault) { try { validateEnvelope(c.vault); ledger.vault = c.vault; } catch (e) { } }
    return { ledger: validateLedger(ledger), files: c.files, report: c.report, old: true, hasVault: !!ledger.vault };
  }
  throw Error('unknown');
}
export async function applyBackup(book, parsed, mode) {
  const L = book.ledger;
  if (mode === 'replace' || !L.accounts.length || L.demo) book.replace(parsed.ledger);
  else {
    const ids = new Set(L.accounts.map(a => a.id)), eids = new Set(L.entries.map(e => e.id));
    parsed.ledger.accounts.forEach(a => { if (!ids.has(a.id)) L.accounts.push(a); });
    parsed.ledger.entries.forEach(e => { if (!eids.has(e.id)) L.entries.push(e); });
    if (parsed.ledger.vault && !L.vault) L.vault = parsed.ledger.vault;
  }
  delete book.ledger.demo;
  for (const [k, v] of Object.entries(parsed.files || {})) if (v && typeof v.data === 'string') await filePut(k, v).catch(() => { });
  await book.flush();
}
