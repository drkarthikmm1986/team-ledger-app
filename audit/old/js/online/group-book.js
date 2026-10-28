/* Group (online) book. The shared document stays in the old v3 format so members on the
   old app and the new app can work in the same group. Edits are applied to the v3 document,
   encrypted on this device, and saved with revision checks. */
import { toPersonal, validatePersonal } from './personal-model.js';
import { convert } from '../core/import-old.js';
import { uuid } from '../core/util.js';

const clone = v => structuredClone(v);

function editableSource(ev) {
  return !!ev && !ev.flowAmounts && !ev.holdMode && (ev.movement === undefined || ev.movement === 'debt') && ev.amount > 0 && !(ev.finance && ev.finance.payment);
}

export function createGroupBook(groups) {
  let v3 = null, view = { accounts: [], entries: [], files: {} };
  function rebuild() {
    v3 = toPersonal(groups.current.ledger);
    const c = convert(clone(v3), uuid);
    const byId = new Map(v3.entries.map(e => [e.id, e]));
    const files = {};
    for (const e of c.entries) {
      const srcId = e.id.replace(/-(in|out)$/, '');
      const src = byId.get(e.id) || byId.get(srcId);
      e.locked = !editableSource(byId.get(e.id));
      if (src && Array.isArray(src.attachments)) {
        e.files = e.id.endsWith('-out') ? [] : src.attachments.map(a => { files[a.id] = { name: a.name || 'file', mime: a.mime, data: a.data }; return { id: a.id, name: a.name || 'file', mime: a.mime }; });
      }
    }
    const accMap = new Map(v3.accounts.map(a => [a.id, a]));
    c.accounts.forEach(a => { const src = accMap.get(a.id); a.locked = !!(src && src.kind === 'profit'); });
    view = { accounts: c.accounts, entries: c.entries, files };
  }
  async function commit(next) {
    validatePersonal(next);
    if (typeof window !== 'undefined' && window.TL_VALIDATE_V3) window.TL_VALIDATE_V3(next);
    await groups.save({ ...groups.current.ledger, personal: clone(next) });
    rebuild();
  }
  const financeFor = (rate, commRate) => ({ version: 1, enabled: true, include: true, inRate: rate || 0, outRate: rate || 0, commissionRate: commRate || 0, outCommissionRate: 0, payment: false, paid: 0 });

  const book = {
    kind: 'group',
    get id() { return groups.current.row.id; },
    get name() { return groups.current.row.name; },
    get role() { return groups.current.role; },
    get canEdit() { return ['admin', 'editor'].includes(groups.current.role); },
    get accounts() { return view.accounts; },
    get entries() { return view.entries; },
    get vault() { return v3 && v3.accountDetailsVault || null; },
    get v3() { return v3; },
    refresh() { rebuild(); return book; },
    async reload() { await groups.load(groups.current.row.id); rebuild(); return book; },
    account: id => view.accounts.find(a => a.id === id),
    getFile: async meta => view.files[meta.id] || null,
    async putAccount(a) {
      const next = clone(v3); let src = next.accounts.find(x => x.id === a.id);
      if (!src) { src = { id: a.id || uuid(), name: a.name, opening: a.opening || 0, kind: 'ledger', flow: 'general', profitRate: a.rate || 0, created: Date.now() }; if (a.commRate) src.finance = financeFor(a.rate, a.commRate); next.accounts.push(src); a.id = src.id; }
      else {
        src.name = a.name; src.opening = a.opening || 0;
        if (src.finance && src.finance.enabled) Object.assign(src.finance, { inRate: a.rate || 0, outRate: a.rate || 0, commissionRate: a.commRate || 0 });
        else if (a.commRate) src.finance = financeFor(a.rate, a.commRate);
        else src.profitRate = a.rate || 0;
      }
      await commit(next); return a;
    },
    async deleteAccount(id) {
      const next = clone(v3);
      next.accounts = next.accounts.filter(a => a.id !== id);
      next.entries = next.entries.filter(e => e.accountId !== id);
      if (next.holds) next.holds = next.holds.filter(h => h.accountId !== id);
      if (next.profits) next.profits = next.profits.filter(p => p.accountId !== id);
      await commit(next); return null;
    },
    async putEntry(rec, newFiles) {
      const next = clone(v3), acc = next.accounts.find(a => a.id === rec.acc);
      if (!acc) throw Error('Account not found');
      let ev = next.entries.find(e => e.id === rec.id);
      const fresh = !ev;
      if (fresh) {
        ev = { id: rec.id || uuid(), accountId: rec.acc, date: rec.date, time: rec.time || '00:00', amount: rec.amt, effect: rec.dir, partyId: null, party: '', typeId: null, typeName: rec.dir > 0 ? 'Money in' : 'Money out', note: '', rate: 0, cost: 0, movement: 'debt', profitOnly: false, created: Date.now(), attachments: [] };
        if (acc.finance && acc.finance.enabled) ev.finance = { ...clone(acc.finance), payment: false, paid: 0, source: 'account' };
        next.entries.push(ev);
      } else if (!editableSource(ev)) throw Error('locked');
      ev.accountId = rec.acc; ev.amount = rec.amt; ev.effect = rec.dir; ev.date = rec.date; ev.time = rec.time || '00:00';
      ev.note = (rec.note || '').slice(0, 2000);
      if ((rec.party || '') !== (ev.party || '')) { ev.party = (rec.party || '').slice(0, 80); ev.partyId = null; }
      if (rec.cat) ev.typeName = rec.cat.slice(0, 80);
      if (rec.rate != null || rec.commRate != null) {
        if ((ev.finance && ev.finance.enabled) || rec.commRate) {
          const r = rec.rate != null ? rec.rate : (ev.finance ? ev.finance.inRate : acc.profitRate || 0);
          ev.finance = { ...(ev.finance && ev.finance.enabled ? ev.finance : financeFor(0, 0)), inRate: r, outRate: r, commissionRate: rec.commRate != null ? rec.commRate : (ev.finance ? ev.finance.commissionRate : 0), source: 'entry' };
        } else { ev.rate = rec.rate > 0 ? rec.rate : 0; ev.profitDisabled = rec.rate === 0; }
      }
      const added = new Map((newFiles || []).map(f => [f.id, f.data]));
      ev.attachments = (rec.files || []).map(m => { const old = (ev.attachments || []).find(a => a.id === m.id); if (old) return old; const d = added.get(m.id); return d ? { id: m.id, name: (d.name || 'file').slice(0, 80), mime: d.mime, data: d.data } : null; }).filter(Boolean).slice(0, 5);
      await commit(next); return rec;
    },
    async deleteEntry(id) {
      const next = clone(v3), ev = next.entries.find(e => e.id === id);
      if (!ev || !editableSource(ev)) throw Error('locked');
      next.entries = next.entries.filter(e => e.id !== id);
      if (next.holds) next.holds = next.holds.filter(h => h.ledgerEntryId !== id);
      await commit(next); return null;
    },
    async setVault(env) { const next = clone(v3); if (env) next.accountDetailsVault = env; else delete next.accountDetailsVault; await commit(next); }
  };
  rebuild();
  return book;
}
