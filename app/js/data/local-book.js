/* The personal (offline) book. Same interface as the group book. */
import { docGet, docPut, fileGet, filePut, fileDel } from './db.js';

export const emptyLedger = () => ({ app: 'team-ledger', version: 1, accounts: [], entries: [], created: Date.now() });

export function createLocalBook() {
  let L = emptyLedger(), timer = null, ok = true, onError = () => { };
  const book = {
    id: 'local', kind: 'local', canEdit: true,
    get name() { return 'Team Ledger'; },
    get ledger() { return L; },
    get accounts() { return L.accounts; },
    get entries() { return L.entries; },
    get vault() { return L.vault || null; },
    get demo() { return !!L.demo; },
    get storageOk() { return ok; },
    onError(fn) { onError = fn; },
    async load() { try { const d = await docGet('ledger'); if (d && Array.isArray(d.accounts)) L = d; } catch (e) { ok = false; } return book; },
    replace(next) { L = next; book.save(); },
    save() { clearTimeout(timer); timer = setTimeout(book.flush, 120); },
    async flush() { clearTimeout(timer); try { await docPut('ledger', L); ok = true; } catch (e) { ok = false; onError(e); } },
    account: id => L.accounts.find(a => a.id === id),
    async putAccount(a) { const i = L.accounts.findIndex(x => x.id === a.id); if (i >= 0) L.accounts[i] = a; else L.accounts.push(a); book.save(); return a; },
    async deleteAccount(id) {
      const acc = book.account(id), entries = L.entries.filter(e => e.acc === id);
      L.accounts = L.accounts.filter(a => a.id !== id); L.entries = L.entries.filter(e => e.acc !== id); book.save();
      return async () => { L.accounts.push(acc); L.entries.push(...entries); book.save(); };
    },
    /** newFiles: [{id, data:{name,mime,data}}] to store alongside the entry */
    async putEntry(rec, newFiles) {
      const i = L.entries.findIndex(e => e.id === rec.id);
      if (i >= 0) { const removed = (L.entries[i].files || []).filter(x => !rec.files.some(y => y.id === x.id)); removed.forEach(x => fileDel(x.id).catch(() => { })); L.entries[i] = rec; }
      else L.entries.push(rec);
      for (const f of newFiles || []) if (rec.files.some(y => y.id === f.id)) await filePut(f.id, f.data).catch(() => { });
      book.save(); return rec;
    },
    async deleteEntry(id) { const i = L.entries.findIndex(e => e.id === id); const removed = L.entries.splice(i, 1)[0]; book.save(); return async () => { L.entries.push(removed); book.save(); }; },
    getFile: meta => fileGet(meta.id),
    async setVault(env) { if (env) L.vault = env; else delete L.vault; await book.flush(); }
  };
  return book;
}
