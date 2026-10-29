/* Converts an old Team Ledger (v3) backup or group document into the new model.
   The old balance and profit rules are reproduced exactly. */
const FIELDS = ['inRate', 'outRate', 'commissionRate', 'outCommissionRate'];
function percent(amount, rate) { return Number((BigInt(amount) * BigInt(rate || 0) + 5000n) / 10000n); }
function effectiveFinance(f, account) {
  if (!f) return f;
  const display = (account && account.finance && account.finance.display) || f.display;
  const out = Object.assign({}, f, { display });
  FIELDS.forEach(k => { out[k] = display && display[k] === false ? 0 : (f[k] || 0); });
  return out;
}
function visible(account, key) {
  const map = { inProfit: 'inRate', outProfit: 'outRate' };
  return !(account && account.finance && account.finance.display && account.finance.display[map[key] || key] === false);
}
function flow(e) {
  if (e.holdMode === 'profit') return { inward: 0, outward: 0 };
  return e.flowAmounts || { inward: e.effect === 1 ? e.amount : 0, outward: e.effect === -1 ? e.amount : 0 };
}
// Balance effect, identical to the old app.
function balanceEffect(e) {
  if (e.holdMode === 'profit') return 0;
  if (e.movement === 'fund_use' || e.movement === 'fund_return') return 0;
  if (e.flowAmounts) return e.flowAmounts.inward - e.flowAmounts.outward + (e.profitOnly ? 0 : e.effect * (e.cost || 0));
  return e.effect * (e.amount + (e.profitOnly ? 0 : (e.cost || 0)));
}
function legacyRate(e, account) {
  return e.rate > 0 ? e.rate : (e.rate < 0 || e.profitDisabled) ? 0 : ((account && account.profitRate) || 0);
}
function amounts(entry, account) {
  let legacy = Math.round(entry.amount * legacyRate(entry, account) / 1e4);
  if (entry.holdMode) return { profit: entry.holdMode === 'profit' ? entry.amount : 0, payable: 0, paid: 0, rate: 0 };
  const f = effectiveFinance(entry.finance, account);
  const inward = entry.effect === 1;
  if (!(f && f.enabled) && !visible(account || { finance: f }, inward ? 'inProfit' : 'outProfit')) legacy = 0;
  if (!(f && f.enabled)) return { profit: legacy, payable: 0, paid: (f && f.paid) || 0, rate: legacyRate(entry, account) };
  if (f.payment) return { profit: 0, payable: 0, paid: entry.amount, rate: 0 };
  if (entry.flowAmounts) {
    const v = flow(entry);
    const inP = f.include ? percent(v.inward, f.inRate) : 0, outP = f.include ? percent(v.outward, f.outRate) : 0;
    const pay = f.include ? percent(v.inward, f.commissionRate) + percent(v.outward, f.outCommissionRate || 0) : 0;
    return { profit: inP + outP - pay, payable: pay, paid: f.paid || 0, rate: f.include ? f.inRate : 0 };
  }
  const rate = inward ? f.inRate : f.outRate;
  const profit = f.include ? percent(entry.amount, rate) : 0;
  const payable = f.include ? percent(entry.amount, inward ? f.commissionRate : (f.outCommissionRate || 0)) : 0;
  return { profit: profit - payable, payable, paid: f.paid || 0, rate: f.include ? rate : 0 };
}

function isOldBackup(d) { return d && d.version === 3 && Array.isArray(d.accounts) && Array.isArray(d.entries); }

function convert(old, makeId) {
  if (!isOldBackup(old)) throw Error('not-old');
  const id = makeId || (() => Math.random().toString(36).slice(2) + Date.now().toString(36));
  const report = { accounts: 0, entries: 0, files: 0, holds: 0, settlements: 0, profits: 0, skipped: 0 };
  const accounts = [], entries = [], files = {};
  const parties = new Map((old.parties || []).map(p => [p.id, p.name]));
  const types = new Map((old.types || []).map(t => [t.id, t.name]));
  const accById = new Map(old.accounts.map(a => [a.id, a]));
  old.accounts.forEach((a, i) => {
    const f = a.finance && a.finance.enabled ? effectiveFinance(a.finance, a) : null;
    const fin = f ? { inProfit: f.inRate || 0, outProfit: f.outRate || 0, inComm: f.commissionRate || 0, outComm: f.outCommissionRate || 0 }
      : { inProfit: a.profitRate || 0, outProfit: a.profitRate || 0, inComm: 0, outComm: 0 };
    accounts.push({
      id: a.id, name: String(a.name || 'Account').slice(0, 80), phone: '', note: '',
      opening: Number.isSafeInteger(a.opening) ? a.opening : 0,
      rate: fin.inProfit, commRate: fin.inComm, fin,
      created: a.created || i, imported: true
    });
    report.accounts++;
  });
  const pushFiles = (list, owner) => (list || []).map((f, i) => {
    if (!f || typeof f.data !== 'string') return null;
    const fid = 'f' + (f.id || owner + '-' + i).replace(/[^A-Za-z0-9-]/g, '').slice(0, 60) || id();
    files[fid] = { name: f.name || ('file-' + (i + 1)), mime: f.mime || 'application/octet-stream', data: f.data };
    report.files++;
    return { id: fid, name: f.name || ('file-' + (i + 1)), mime: f.mime || 'application/octet-stream' };
  }).filter(Boolean);

  for (const e of old.entries) {
    const account = accById.get(e.accountId);
    if (!account) { report.skipped++; continue; }
    const a = amounts(e, account);
    const eff = balanceEffect(e);
    const base = {
      acc: e.accountId, date: e.date, time: e.time || '00:00',
      note: e.note || '',
      party: (e.partyId && parties.get(e.partyId)) || e.party || '',
      cat: e.typeName || (e.typeId && types.get(e.typeId)) || '',
      created: e.created || 0, imported: true
    };
    const attach = pushFiles(e.attachments, e.id);
    if (e.flowAmounts) {
      // One old "In + Out" record becomes two simple records.
      const v = e.flowAmounts;
      entries.push(Object.assign({}, base, { id: e.id + '-in', dir: 1, amt: v.inward + (e.profitOnly ? 0 : (e.cost || 0)), profit: a.profit, comm: a.payable, commPaid: a.paid, files: attach }));
      entries.push(Object.assign({}, base, { id: e.id + '-out', dir: -1, amt: v.outward, profit: 0, comm: 0, commPaid: 0, files: [] }));
      report.entries += 2;
      continue;
    }
    const rec = Object.assign({}, base, {
      id: e.id, dir: eff < 0 ? -1 : (eff > 0 ? 1 : (e.effect === -1 ? -1 : 1)),
      amt: eff !== 0 ? Math.abs(eff) : e.amount,
      profit: a.profit, comm: a.payable, commPaid: a.paid, files: attach
    });
    if (eff === 0) rec.noBal = true;
    if (e.holdMode) rec.cat = rec.cat || 'Hold';
    if (e.movement === 'fund_use' || e.movement === 'fund_return') rec.cat = rec.cat || (e.movement === 'fund_use' ? 'Fund use' : 'Fund return');
    if (e.amount === 0 && a.paid > 0) { rec.amt = a.paid; rec.noBal = true; rec.cat = 'Commission paid'; }
    entries.push(rec);
    report.entries++;
  }
  // Hold / to receive: kept as its own list, exactly like the old app (separate, or linked to an In / Out / Profit record)
  const holds = [];
  for (const h of old.holds || []) {
    report.holds++;
    const linked = h.ledgerEntryId && old.entries.some(e => e.id === h.ledgerEntryId);
    holds.push({ id: h.id, acc: h.accountId, name: h.name || '', amt: h.amount, date: h.date, note: h.note || '', done: !!h.done,
      mode: linked ? (h.holdMode || (h.ledgerEffect === -1 ? 'out' : 'in')) : 'separate', entryId: linked ? h.ledgerEntryId : undefined });
  }
  for (const a of old.accounts) for (const s of a.settlements || []) {
    report.settlements++;
    entries.push({ id: 'settle-' + s.id, acc: a.id, date: s.date, time: '00:00', dir: -1, amt: s.amount, note: s.note || '', party: '', cat: 'Settled', profit: 0, comm: 0, commPaid: 0, files: [], noBal: true, created: 0, imported: true });
  }
  for (const p of old.profits || []) {
    if (!accById.has(p.accountId)) continue;
    report.profits++;
    entries.push({ id: 'profit-' + p.id, acc: p.accountId, date: p.date, time: '00:00', dir: 1, amt: p.turnover, note: (p.note ? p.note + ' · ' : '') + 'Received ' + (p.received / 100).toFixed(2), party: '', cat: 'Profit', profit: p.profit, comm: 0, commPaid: 0, files: [], noBal: true, created: 0, imported: true });
  }
  // Expected balances, so the import screen can confirm totals match the old app.
  const expected = {};
  for (const a of old.accounts) expected[a.id] = (a.opening || 0) + old.entries.filter(e => e.accountId === a.id).reduce((n, e) => n + balanceEffect(e), 0);
  for (const h of holds) if (h.entryId) { const r = entries.find(e => e.id === h.entryId); if (r) r.holdId = h.id; }
  return { accounts, entries, holds, files, report, expected, vault: old.accountDetailsVault };
}
export { convert, isOldBackup, balanceEffect, amounts };
