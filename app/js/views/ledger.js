/* Ledger screens shared by the personal book and group books: home, account, report, entry form. */
import { $, esc, T, TP, ic, LOGO, money, moneyAbs, nf, today, nowTime, addDays, niceDate, niceTime, dmy, periodRange, PERIODS, avatar, uid, ls, pctToBp, toPaise, VERSION, monName, ymd } from '../core/util.js';
import { counts, sortEntries, accountTotals, allTotals, calcProfit, exprToPaise, suggestNotes, accRates, dirRates, hasRates, isSettle, RATE_KEYS } from '../core/ledger.js';
import { toast, openSheet, closeSheet, confirmBox, sheetState, pickFiles, openFileData, saveFile, shareText } from '../ui/kit.js';
import { native, locale } from '../core/util.js';
import { importSheet } from './import.js';

export const safeId = id => /^[A-Za-z0-9-]{1,80}$/.test(id) ? id : 'h' + [...new TextEncoder().encode(id)].map(b => b.toString(16).padStart(2, '0')).join('');
export const fromSafeId = s => /^h([0-9a-f]{2})+$/.test(s) && s.length > 3 ? new TextDecoder().decode(Uint8Array.from(s.slice(1).match(/../g).map(h => parseInt(h, 16)))) : s;
export const accRoute = (book, id) => book.prefix + 'acc-' + safeId(id);

/* ---------------- shared bits ---------------- */
export function periodChips(cur, key) {
  return `<div class="chips">${PERIODS().map(([k, l]) => `<button class="chip ${cur === k ? 'on' : ''}" data-act="period" data-k="${k}" data-for="${key}">${l}</button>`).join('')}</div>`;
}
export function customDates(c, key) {
  return `<div class="row2 mt8"><input class="input" type="date" data-act="custom" data-i="0" data-for="${key}" value="${c[0]}" aria-label="${T('முதல்', 'From')}"><input class="input" type="date" data-act="custom" data-i="1" data-for="${key}" value="${c[1]}" aria-label="${T('வரை', 'To')}"></div>`;
}
function entryRow(book, e, bal, showAcc) {
  const acc = book.account(e.acc);
  if (isSettle(e)) return `<button class="entry" data-act="edit-entry" data-id="${esc(e.id)}">
    <span class="arrow settle">${ic('coin', 20, 2.4)}</span>
    <span class="meta"><span class="t1">${esc(e.note || T('லாபத்திலிருந்து எடுத்தது', 'Taken from profit'))}</span><span class="t2">${esc([showAcc && acc ? acc.name : niceDate(e.date), T('இருப்பை மாற்றாது', 'Balance not changed')].join(' · '))}</span></span>
    <span class="amt num settle-t">−${moneyAbs(e.amt)}<small>${T('லாபத்திலிருந்து', 'from profit')}</small></span></button>`;
  const nb = !counts(e);
  const CAT = { 'Money in': T('வரவு', 'Money in'), 'Money out': T('செலவு', 'Money out'), 'Money given': T('கொடுத்தது', 'Money given'), 'Return': T('திரும்ப வந்தது', 'Return'), 'Deposit': T('வைப்பு', 'Deposit'), 'Withdrawal': T('எடுத்தது', 'Withdrawal'), 'Hold': T('நிலுவை', 'Hold'), 'Hold / To receive': T('நிலுவை', 'Hold'), 'Settled': T('தீர்வு', 'Settled'), 'Profit': T('லாபம்', 'Profit'), 'Commission paid': T('கமிஷன் செலுத்தியது', 'Commission paid') };
  const catName = c => CAT[c] || c;
  const title = e.note || catName(e.cat) || e.party || (e.dir > 0 ? T('வரவு', 'Money in') : T('செலவு', 'Money out'));
  const sub = [showAcc && acc ? acc.name : niceDate(e.date), niceTime(e.time), e.party && e.party !== title ? e.party : '', e.files && e.files.length ? '📎' + e.files.length : ''].filter(Boolean).join(' · ');
  const tag = e.pending ? `<span class="tag">${T('நிலுவை', 'Pending')}</span>` : e.noBal ? `<span class="tag">${esc(catName(e.cat) || T('தகவல்', 'Info'))}</span>` : '';
  return `<button class="entry" data-act="edit-entry" data-id="${esc(e.id)}">
    <span class="arrow ${nb ? 'nb' : e.dir > 0 ? 'in' : 'out'}">${ic(e.dir > 0 ? 'down' : 'up', 20, 2.6)}</span>
    <span class="meta"><span class="t1">${esc(title)}${tag}</span><span class="t2">${esc(sub)}</span></span>
    <span class="amt num ${nb ? 'muted' : e.dir > 0 ? 'in' : 'out'}">${e.dir > 0 ? '+' : '−'}${moneyAbs(e.amt)}${bal != null ? `<small>${T('இருப்பு', 'Bal')} ${money(bal)}</small>` : ''}${e.profit || e.comm ? `<small class="pf">${T('லாபம்', 'Profit')} ${money((e.profit || 0) + (e.comm || 0))}${e.comm ? ` · ${T('கமிஷன்', 'Comm.')} ${moneyAbs(e.comm)}` : ''}</small>` : ''}</span>
  </button>`;
}
export function helpSteps() {
  return `<div class="steps">
    <div class="step"><span class="n">1</span><div><b>${T('கணக்கைச் சேர்', 'Add an account')}</b><p>${T('ஆள், கடை அல்லது வேலையின் பெயர். உதா: “முருகன்”, “கடை”, “வீட்டுச் செலவு”', 'A person, shop or purpose. e.g. “Murugan”, “Shop”, “Home expenses”')}</p></div></div>
    <div class="step"><span class="n in-bg">2</span><div><b>${T('பச்சை = பணம் வந்தது', 'Green = money in')}</b><p>${T('தொகையை அடித்து சேமி. குறிப்பு வேண்டுமானால் மட்டும்.', 'Type the amount and save. A note is optional.')}</p></div></div>
    <div class="step"><span class="n out-bg">3</span><div><b>${T('சிவப்பு = பணம் போனது', 'Red = money out')}</b><p>${T('இருப்பு தானாகவே கணக்கிடப்படும். அறிக்கையில் PDF எடுக்கலாம்.', 'Balance is calculated for you. Get a PDF from Report.')}</p></div></div>
  </div>`;
}

/* ---------------- Home ---------------- */
export function viewHome(ctx, book) {
  const t = today(), io = ls.get('tl4-home-io', 'today') === 'total' ? 'total' : 'today';
  const group = book.kind === 'group';
  const top = group
    ? `<div class="topbar"><button class="icon-btn" data-go="online" aria-label="${T('பின்', 'Back')}">${ic('back')}</button><h1>${esc(book.name)}<span class="sub line-blue">${ic('users', 14)} ${T('குழுக் கணக்கு', 'Group book')} · ${esc(roleName(book.role))}</span></h1>
       <button class="icon-btn" data-act="group-refresh" aria-label="${T('புதுப்பி', 'Refresh')}">${ic('refresh')}</button><button class="icon-btn" data-go="${book.prefix}report" aria-label="${T('அறிக்கை', 'Report')}">${ic('chart')}</button><button class="icon-btn" data-go="${book.prefix}team" aria-label="${T('குழு', 'Team')}">${ic('users')}</button></div>`
    : `<div class="topbar"><span class="logo">${LOGO}</span><h1>Team Ledger<span class="sub">${T('உங்கள் வரவு செலவு புத்தகம்', 'Your money book')}</span></h1>
       ${book.accounts.length ? `<button class="icon-btn" data-act="search" aria-label="${T('தேடு', 'Search')}">${ic('search')}</button>` : ''}</div>`;
  if (!book.accounts.length) {
    return top + (ctx.preview ? previewNote() : '') + `<div class="empty card">
      <div class="art"><svg width="92" height="92" viewBox="0 0 96 96" aria-hidden="true"><rect x="14" y="22" width="60" height="56" rx="12" fill="var(--brand)" opacity=".9"/><rect x="22" y="14" width="60" height="56" rx="12" fill="var(--card)" stroke="var(--brand)" stroke-width="3"/><path d="M36 34h32M36 44h22" stroke="var(--brand)" stroke-width="4" stroke-linecap="round"/><circle cx="66" cy="66" r="16" fill="var(--in)"/><path d="M66 58v16M58 66h16" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg></div>
      <h3>${group ? T('இந்தக் குழுவில் இன்னும் கணக்கு இல்லை', 'No accounts in this group yet') : T('வணக்கம்! 👋', 'Welcome! 👋')}</h3>
      <p>${T('கீழே உள்ள பச்சை பட்டனில் பணம் வந்ததை, சிவப்பு பட்டனில் பணம் போனதை எழுதுங்கள். அவ்வளவுதான்!', 'Tap green when money comes in, red when money goes out. That’s it!')}</p>
      ${book.canEdit ? `<button class="btn block" data-act="new-account">${ic('plus')}${T('முதல் கணக்கைச் சேர்', 'Add first account')}</button>` : `<p class="note">${T('இந்தக் குழுவில் உங்களுக்குப் பார்க்க மட்டும் அனுமதி.', 'You can view this group only.')}</p>`}
      ${group ? '' : `<div class="row2 mt10"><button class="btn ghost sm" data-act="restore">${ic('upload', 18)}${T('Backup ஏற்று', 'Restore backup')}</button><button class="btn ghost sm" data-act="demo">${ic('spark', 18)}${T('மாதிரி பார்', 'Try demo')}</button></div>`}
    </div>${group ? '' : `<div class="section-h"><h2>${T('3 படிகளில்', 'In 3 steps')}</h2></div>${helpSteps()}`}`;
  }
  const q = (ctx.ui.q || '').trim().toLowerCase();
  let accs = book.accounts.filter(a => !a.archived).map(a => ({ a, t: accountTotals(book, a, '', ''), d: io === 'today' ? accountTotals(book, a, t, t) : null }));
  accs.sort((x, y) => (y.t.last || '').localeCompare(x.t.last || '') || x.a.name.localeCompare(y.a.name));
  let found = [];
  if (q) {
    accs = accs.filter(x => x.a.name.toLowerCase().includes(q) || (x.a.phone || '').includes(q));
    found = sortEntries(book.entries.filter(e => (e.note || '').toLowerCase().includes(q) || (e.party || '').toLowerCase().includes(q) || (e.cat || '').toLowerCase().includes(q) || String(e.amt / 100).startsWith(q))).reverse().slice(0, 40);
  }
  const backupDue = !group && book.entries.length >= 5 && (Date.now() - Number(ls.get('tl4-last-backup', '0'))) > 7 * 864e5;
  return top + (ctx.preview && !group ? previewNote() : '') + `
    ${backupDue ? `<button class="row card mt12 rounded" data-act="backup"><span class="ic amber">${ic('bell')}</span><span class="tx"><b>${T('Backup எடுக்கும் நேரம்', 'Time for a backup')}</b><small>${T('போன் தொலைந்தாலும் கணக்கு பாதுகாப்பாக இருக்கும்', 'Keeps your records safe if the phone is lost')}</small></span><span class="end">${ic('save', 20)}</span></button>` : ''}
    ${ctx.ui.searchOpen || q ? `<label class="search">${ic('search', 20)}<input id="q" type="search" value="${esc(ctx.ui.q)}" placeholder="${T('பெயர், குறிப்பு, தொகை தேடு', 'Search name, note, amount')}" autocomplete="off"><button data-act="search-close" aria-label="close">${ic('x', 20)}</button></label>` : ''}
    <div class="section-h"><h2>${T('கணக்குகள்', 'Accounts')} <span class="muted">· ${accs.length}</span></h2>
      <span class="seg sm-seg" role="group" aria-label="${T('வரவு / செலவு காட்டுவது', 'In / out shows')}"><button class="${io === 'today' ? 'on' : ''}" data-act="home-io" data-v="today">${T('இன்று', 'Today')}</button><button class="${io === 'total' ? 'on' : ''}" data-act="home-io" data-v="total">${T('மொத்தம்', 'Total')}</button></span>
      ${book.canEdit ? `<button class="link-btn" data-act="new-account">${ic('plus', 18, 2.6)}${T('புதிது', 'New')}</button>` : ''}</div>
    <div class="list">${accs.map(({ a, t, d }) => `
      <button class="acc acc2" data-go="${accRoute(book, a.id)}"><span class="acc-top">${avatar(a.name)}
        <span class="meta"><span class="name">${esc(a.name)}</span><span class="when">${t.last ? niceDate(t.last) : T('பதிவு இல்லை', 'No entries')}</span></span>
        <span class="bal num ${t.bal < 0 ? 'out' : t.bal > 0 ? 'in' : ''}">${money(t.bal)}<small>${t.gross || t.settled ? `${T('லாபம்', 'Profit')} ${money(t.inHand)}` : T('இருப்பு', 'Balance')}</small></span></span>
        ${accIO(d || t, io)}
      </button>`).join('') || `<p class="muted center">${T('எதுவும் கிடைக்கவில்லை', 'Nothing found')}</p>`}</div>
    ${found.length ? `<div class="section-h"><h2>${T('பதிவுகள்', 'Entries')}</h2></div><div class="entries">${found.map(e => entryRow(book, e, null, true)).join('')}</div>` : ''}`;
}
function accIO(x, io) {
  const dif = x.inn - x.out, lbl = io === 'today' ? [T('இன்று வரவு', 'In today'), T('இன்று செலவு', 'Out today')] : [T('மொத்த வரவு', 'Total in'), T('மொத்த செலவு', 'Total out')];
  return `<span class="acc-io"><span><small><i class="dot in"></i>${lbl[0]}</small><b class="num in">${moneyAbs(x.inn)}</b></span><span class="mid"><small>${T('வித்தியாசம்', 'Difference')}</small><b class="num ${dif < 0 ? 'out' : ''}">${money(dif)}</b></span><span class="r"><small><i class="dot out"></i>${lbl[1]}</small><b class="num out">${moneyAbs(x.out)}</b></span></span>`;
}
const previewNote = () => `<div class="row card mb12 rounded"><span class="ic amber">${ic('info')}</span><span class="tx"><b>${T('இணைய link பதிப்பு', 'Web link version')}</b><small>${T('இங்கே தனிக் கணக்கு, கணக்கு விவரங்கள் வேலை செய்யும். குழுக் கணக்கு (Online), PDF — Android ஆப்பில் (மேலும் → APK).', 'Personal book and Account Details work here. Online groups and PDF work in the Android app (More → APK).')}</small></span></div>`;
export const roleName = r => ({ admin: T('நிர்வாகி', 'Admin'), editor: T('திருத்துபவர்', 'Editor'), commenter: T('கருத்திடுபவர்', 'Commenter'), viewer: T('பார்வையாளர்', 'Viewer') }[r] || r || '');

/* ---------------- Profit card (old app: profit, payable commission, settlement, in hand) ---------------- */
function profitCard(book, a, t) {
  const r = accRates(a), pct = v => (v / 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  const rates = [[r.inProfit, T('வரவு லாபம்', 'In profit')], [r.outProfit, T('செலவு லாபம்', 'Out profit')], [r.inComm, T('வரவு கமிஷன்', 'In commission')], [r.outComm, T('செலவு கமிஷன்', 'Out commission')]].filter(x => x[0]);
  const line = (label, v, cls, strong) => `<div class="pc-row ${strong ? 'strong' : ''}"><span>${label}</span><b class="num ${cls || ''}">${money(v)}</b></div>`;
  return `<section class="card profit-card">
    <div class="pc-h"><b>${ic('coin', 18)} ${T('லாபக் கணக்கு', 'Profit account')}</b>${rates.length ? `<span class="pc-rates">${rates.map(x => `<span>${x[1]} ${pct(x[0])}</span>`).join('')}</span>` : ''}</div>
    ${line(T('லாபம்', 'Profit'), t.gross, 'in')}
    ${t.comm ? line(T('− கொடுக்க வேண்டிய கமிஷன்', '− Commission payable'), -t.comm, 'out') : ''}
    ${t.comm ? line(T('நிகர லாபம்', 'Net profit'), t.profit, '', true) : ''}
    ${t.settled ? line(T('− லாபத்திலிருந்து எடுத்தது', '− Taken from profit'), -t.settled, 'amber') : ''}
    ${line(T('கையிருப்பு லாபம்', 'Profit in hand'), t.inHand, t.inHand < 0 ? 'out' : 'in', true)}
    ${t.paid ? `<p class="note">${T('கமிஷன் செலுத்தியது', 'Commission paid')} ${money(t.paid)}</p>` : ''}
    ${book.canEdit && !a.locked ? `<button class="btn ghost sm block mt8" data-act="settle-new" data-acc="${esc(a.id)}">${ic('coin', 18)}${T('லாபத்திலிருந்து எடு (Settle)', 'Take from profit (Settle)')}</button>` : ''}
  </section>`;
}
export function settleSheet(ctx, book, a, edit) {
  const t = accountTotals(book, a);
  const f = edit ? { amt: edit.amt, date: edit.date, note: edit.note || '' } : { amt: 0, date: today(), note: '' };
  const body = `<div class="pc-row strong"><span>${T('கையிருப்பு லாபம்', 'Profit in hand')}</span><b class="num ${t.inHand < 0 ? 'out' : 'in'}">${money(t.inHand + (edit ? edit.amt : 0))}</b></div>
    <div class="field mt12"><label for="st-amt">${T('எடுத்த தொகை ₹', 'Amount taken ₹')}</label><input class="input" id="st-amt" type="number" inputmode="decimal" step="0.01" min="0" value="${f.amt ? f.amt / 100 : ''}" placeholder="0"></div>
    <div class="field"><label for="st-date">${T('தேதி', 'Date')}</label><input class="input" id="st-date" type="date" value="${f.date}"></div>
    <div class="field"><label for="st-note">${T('குறிப்பு (விருப்பம்)', 'Note (optional)')}</label><input class="input" id="st-note" maxlength="300" value="${esc(f.note)}" placeholder="${T('உதா: பங்குதாரருக்கு, சொந்தச் செலவு', 'e.g. To partner, personal use')}"></div>
    <p class="note">${T('இது லாபத்திலிருந்து மட்டும் கழியும். கணக்கு இருப்பு மாறாது.', 'This is taken from the profit only. The account balance does not change.')}</p>
    ${edit ? `<button class="btn danger block mt14" id="st-del">${ic('trash', 20)}${T('நீக்கு', 'Delete')}</button>` : ''}`;
  openSheet(T('லாபத்திலிருந்து எடு', 'Take from profit'), body, `<button class="btn block" id="st-save">${ic('check', 22, 3)}${T('சேமி', 'Save')}</button>`);
  $('#st-save').onclick = async () => {
    const amt = Math.round(Number($('#st-amt').value || 0) * 100);
    if (!Number.isSafeInteger(amt) || amt <= 0 || amt > 1e14) { toast(T('தொகையை அடிக்கவும்', 'Please type the amount')); return; }
    const rec = { id: edit ? edit.id : (book.putSettle ? 'settle-' + uid() : uid()), kind: 'settle', acc: a.id, dir: -1, amt, date: $('#st-date').value || today(), time: '00:00', note: $('#st-note').value.trim(), party: '', cat: 'Settled', noBal: true, profit: 0, comm: 0, files: [], created: edit ? edit.created : Date.now(), updated: Date.now() };
    $('#st-save').disabled = true;
    try { if (book.putSettle) await book.putSettle(rec); else await book.putEntry(rec, []); closeSheet(); ctx.render(); toast(T('சேமிக்கப்பட்டது', 'Saved')); }
    catch (e) { toast(ctx.errorText(e)); $('#st-save').disabled = false; }
  };
  if (edit) $('#st-del').onclick = async () => {
    if (!await confirmBox(T('நீக்கவா?', 'Delete?'), T('இந்தப் பதிவு நீக்கப்படும்.', 'This entry will be deleted.'), T('நீக்கு', 'Delete'), true)) return;
    try { if (book.deleteSettle) await book.deleteSettle(edit.id); else await book.deleteEntry(edit.id); ctx.render(); toast(T('நீக்கப்பட்டது', 'Deleted')); } catch (e) { toast(ctx.errorText(e)); }
  };
}

/* ---------------- Account ---------------- */
export function viewAccount(ctx, book, a) {
  const [from, to] = periodRange(ctx.ui.period, ctx.ui.custom);
  const t = accountTotals(book, a, from, to);
  const groups = new Map();
  t.rows.slice().reverse().forEach(r => { if (!groups.has(r.e.date)) groups.set(r.e.date, []); groups.get(r.e.date).push(r); });
  const hasProfit = !!(t.gross || t.comm || t.settled || hasRates(a));
  return `<div class="topbar"><button class="icon-btn" data-go="${book.prefix.replace(/-$/, '')}" aria-label="${T('பின்', 'Back')}">${ic('back')}</button>
    <h1>${esc(a.name)}${a.phone ? `<span class="sub">${esc(a.phone)}</span>` : book.kind === 'group' ? `<span class="sub line-blue">${esc(book.name)}</span>` : ''}</h1>
    <button class="icon-btn" data-act="acc-menu" data-id="${esc(a.id)}" aria-label="${T('விருப்பங்கள்', 'Options')}">${ic('dots', 22, 3)}</button></div>
    <section class="hero ${book.kind === 'group' ? 'hero-blue' : ''}">
      <div class="label">${ctx.ui.period === 'all' ? T('இருப்பு', 'Balance') : T('முடிவு இருப்பு', 'Closing balance')}</div>
      <div class="big num">${money(t.bal)}</div>
      <div class="pills">
        <div class="pill"><small><i class="dot in"></i>${T('வரவு', 'In')}</small><b class="num">${money(t.inn)}</b></div>
        <div class="pill"><small><i class="dot out"></i>${T('செலவு', 'Out')}</small><b class="num">${money(t.out)}</b></div>
      </div>
      ${t.open ? `<div class="hero-foot"><span>${T('தொடக்க இருப்பு', 'Opening')} ${money(t.open)}</span></div>` : ''}
    </section>
    ${hasProfit ? profitCard(book, a, t) : ''}
    ${periodChips(ctx.ui.period, 'acc')}${ctx.ui.period === 'custom' ? customDates(ctx.ui.custom, 'acc') : ''}
    ${t.rows.length ? [...groups].map(([d, rows]) => {
      const di = rows.reduce((n, r) => n + (counts(r.e) && r.e.dir > 0 ? r.e.amt : 0), 0), dout = rows.reduce((n, r) => n + (counts(r.e) && r.e.dir < 0 ? r.e.amt : 0), 0);
      return `<div class="day-h"><span>${niceDate(d)}</span><span class="num">${di ? `<span class="in">+${moneyAbs(di)}</span> ` : ''}${dout ? `<span class="out">−${moneyAbs(dout)}</span>` : ''}</span></div>
      <div class="entries">${rows.map(r => entryRow(book, r.e, r.bal)).join('')}</div>`;
    }).join('') : `<div class="empty"><p>${T('இந்த காலத்தில் பதிவு இல்லை. கீழே பச்சை அல்லது சிவப்பு பட்டனை அழுத்துங்கள்.', 'No entries in this period. Tap green or red below.')}</p></div>`}`;
}

/* ---------------- Report ---------------- */
/* Report account selection (per book): null = every account. */
export function repIds(ctx, book) {
  const all = (ctx.ui.rSel || {})[book.id] || [];
  const sel = all.filter(id => book.account(id));
  return sel.length && sel.length < book.accounts.length ? sel : null;
}
/* Every money figure the old app showed, in one place: used by the report screen and the PDF. */
export const METRICS = () => [
  ['open', T('தொடக்க இருப்பு', 'Opening'), ''], ['inn', T('வரவு', 'In'), 'in'], ['out', T('செலவு', 'Out'), 'out'],
  ['gIn', T('வரவு லாபம்', 'In profit'), 'in'], ['gOut', T('செலவு லாபம்', 'Out profit'), 'in'],
  ['cIn', T('வரவு கமிஷன்', 'In commission'), 'out'], ['cOut', T('செலவு கமிஷன்', 'Out commission'), 'out'],
  ['profit', T('நிகர லாபம்', 'Net profit'), 'in'], ['settled', T('லாபத்திலிருந்து எடுத்தது', 'Taken from profit'), 'amber'],
  ['inHand', T('கையிருப்பு லாபம்', 'Profit in hand'), 'in'], ['bal', T('இருப்பு', 'Balance'), '']
];
const metricShown = per => {
  const any = k => per.some(t => t[k]);
  const p = any('gIn') || any('gOut') || any('cIn') || any('cOut');
  return { open: true, inn: true, out: true, gIn: any('gIn'), gOut: any('gOut'), cIn: any('cIn'), cOut: any('cOut'), profit: p, settled: any('settled'), inHand: p || any('settled'), bal: true };
};
const cell = (label, v, cls) => `<div><small>${label}</small><b class="num ${v ? cls : 'muted'}">${v ? money(v) : '—'}</b></div>`;
export function viewReport(ctx, book) {
  const [from, to] = periodRange(ctx.ui.rPeriod, ctx.ui.rCustom);
  const ids = repIds(ctx, book);
  const tot = allTotals(book, from, to, ids);
  const accs = book.accounts.filter(a => !ids || ids.includes(a.id)).map(a => ({ a, t: accountTotals(book, a, from, to) }));
  const rangeTxt = from || to ? `${niceDate(from) || '…'} – ${niceDate(to) || '…'}` : T('எல்லா நாட்களும்', 'All time');
  const group = book.kind === 'group';
  const show = metricShown(accs.map(x => x.t)), mets = METRICS().filter(([k]) => show[k]);
  const pickLabel = !ids ? TP('எல்லா கணக்கும் ({n})', 'All accounts ({n})', { n: book.accounts.length }) : ids.length === 1 ? book.account(ids[0]).name : TP('{n} கணக்குகள்', '{n} accounts', { n: ids.length });
  const perName = (PERIODS().find(([k]) => k === ctx.ui.rPeriod) || ['', ''])[1];
  const st = (label, v, cls, wide) => `<div class="stat ${wide ? 'wide' : ''}"><small>${label}</small><b class="num ${cls || ''}">${money(v)}</b></div>`;
  const pStats = mets.filter(([k]) => !['open', 'inn', 'out', 'bal'].includes(k));
  const single = accs.length === 1;
  const jr = [], sr = [];
  for (const { t } of accs) for (const r of t.rows) (isSettle(r.e) ? sr : jr).push(r);
  const byNew = (x, y) => (y.e.date + (y.e.time || '')).localeCompare(x.e.date + (x.e.time || '')) || (y.e.created || 0) - (x.e.created || 0);
  jr.sort(byNew); sr.sort(byNew);
  const keepOpen = k => ls.get(k, '') === '1' ? 'open' : '';
  return `<div class="topbar">${group ? `<button class="icon-btn" data-go="${book.prefix.replace(/-$/, '')}" aria-label="back">${ic('back')}</button>` : `<span class="logo">${ic('chart', 22).replace('currentColor', '#fff')}</span>`}<h1>${T('அறிக்கை', 'Report')}<span class="sub">${group ? esc(book.name) : T('வரவு, செலவு, லாபம்', 'In, out and profit')}</span></h1></div>
    <div class="rep-filter">
      <button class="card" data-act="rper-pick"><span class="ic">${ic('cal', 20)}</span><span class="tx"><small>${T('தேதி', 'Dates')}</small><b>${esc(perName)}</b><em>${esc(rangeTxt)}</em></span></button>
      <button class="card" data-act="racc-pick"><span class="ic">${ic('users', 20)}</span><span class="tx"><small>${T('கணக்குகள்', 'Accounts')}</small><b>${esc(pickLabel)}</b><em>${ids && ids.length > 1 ? esc(ids.map(id => book.account(id).name).join(', ')) : T('தொட்டு மாற்றவும்', 'Tap to change')}</em></span></button>
    </div>
    <div class="stats">
      <div class="stat"><small><i class="dot in"></i>${T('வரவு', 'Money in')}</small><b class="num in">${money(tot.inn)}</b></div>
      <div class="stat"><small><i class="dot out"></i>${T('செலவு', 'Money out')}</small><b class="num out">${money(tot.out)}</b></div>
      <div class="stat"><small>${T('வித்தியாசம் (வரவு − செலவு)', 'Difference (in − out)')}</small><b class="num ${tot.inn - tot.out < 0 ? 'out' : 'in'}">${money(tot.inn - tot.out)}</b></div>
      <div class="stat"><small>${T('முடிவு இருப்பு', 'Closing balance')}</small><b class="num">${money(tot.bal)}</b></div>
      ${pStats.map(([k, label, cls], i) => st(label, tot[k], k === 'inHand' && tot.inHand < 0 ? 'out' : cls, i === pStats.length - 1 && pStats.length % 2)).join('')}
    </div>
    <div class="card chart">${chart(book, from, to, ids)}</div>
    <div class="row2 mt12"><button class="btn" data-act="pdf">${ic('pdf', 20)}PDF</button><button class="btn ghost" data-act="csv">${ic('excel', 20)}Excel</button></div>
    <details class="rep-more card" data-keep="tl4-rep-a" ${ls.get('tl4-rep-a', '1') === '1' ? 'open' : ''}><summary><span class="tx"><b>${single ? T('நாள் வாரியாக', 'Day by day') + ' · ' + esc(accs[0].a.name) : T('கணக்கு வாரியாக', 'By account')}</b><small>${single ? T('ஒவ்வொரு நாளும் ஒரு வரி', 'One line per day') : T('முதலில் சுருக்கம், பிறகு ஒவ்வொரு கணக்கும் · இடப்பக்கம் தள்ளவும்', 'Summary first, then each account · swipe left')}</small></span>${ic('chev', 18)}</summary>
      ${accs.length ? repPanels(book, accs, tot, from, to) : `<p class="muted pad16">${T('கணக்கு இல்லை', 'No accounts')}</p>`}</details>
    <details class="rep-more card" data-keep="tl4-rep-j" ${keepOpen('tl4-rep-j')}><summary><span class="tx"><b>${T('ஜர்னல் · எல்லா பதிவுகளும்', 'Journal · every entry')}</b><small>${TP('{n} பதிவுகள்', '{n} entries', { n: jr.length })}</small></span>${ic('chev', 18)}</summary>
      <div class="jl">${jr.slice(0, 500).map(({ e, bal }) => jRow(book, e, bal, !single)).join('') || `<p class="muted pad16">${T('இந்த காலத்தில் பதிவு இல்லை', 'No entries in this period')}</p>`}${jr.length > 500 ? `<p class="note center">${T('முதல் 500 மட்டும் காட்டப்படுகிறது. முழுதும் PDF / Excel-ல்.', 'Showing the latest 500. Everything is in the PDF / Excel.')}</p>` : ''}</div></details>
    ${sr.length ? `<details class="rep-more card" data-keep="tl4-rep-s" ${keepOpen('tl4-rep-s')}><summary><span class="tx"><b>${T('செட்டில்மெண்ட் · லாபத்திலிருந்து எடுத்தது', 'Settlements · taken from profit')}</b><small>${TP('{n} பதிவுகள்', '{n} entries', { n: sr.length })} · ${money(tot.settled)}</small></span>${ic('chev', 20)}</summary>
      <div class="jl">${sr.map(({ e, bal }) => jRow(book, e, bal, !single)).join('')}</div></details>` : ''}
    <button class="btn block mt12" data-act="pdf">${ic('pdf', 20)}${T('இதை PDF ஆக எடு', 'Download this as PDF')}</button>`;
}
/* Compact money for the report grid: no ₹, paise only when they matter. */
const cmF = v => { if (!v) return ''; const a = Math.abs(v), neg = v < 0 ? '−' : ''; return neg + (a % 100 && a < 1e7 ? (a / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(a / 100).toLocaleString('en-IN')); };
/* Short form for the grid: 1,23,456 → 1.23L, 2,34,56,789 → 2.35Cr, paise only under ₹1,000. */
const cm = v => { if (!v) return ''; const r = Math.abs(v) / 100, neg = v < 0 ? '−' : '', f = (x, d) => x.toFixed(d).replace(/\.?0+$/, '');
  return neg + (r >= 1e7 ? f(r / 1e7, 2) + 'Cr' : r >= 1e5 ? f(r / 1e5, 2) + 'L' : r >= 1000 ? Math.round(r).toLocaleString('en-IN') : f(r, 2)); };
/* Stacked cell: top = in side, bottom = out side (old app style, fits the phone width). */
const pair = (a, b, ca, cb) => `<td class="pr2"><span class="${a ? ca : 'z'}">${cm(a) || '·'}</span><span class="${b ? cb : 'z'}">${cm(b) || '·'}</span></td>`;
const one = (v, c) => `<td class="${v ? c : 'z'}">${cm(v) || '·'}</td>`;
function dayRows(t) {
  const days = new Map();
  for (const { e, bal } of t.rows) {
    let d = days.get(e.date); if (!d) { d = { n: 0, inn: 0, out: 0, gIn: 0, gOut: 0, cIn: 0, cOut: 0, profit: 0, settled: 0, paid: 0, bal: 0 }; days.set(e.date, d); }
    d.n++; d.bal = bal;
    if (isSettle(e)) { d.settled += e.amt; continue; }
    if (counts(e)) { if (e.dir > 0) d.inn += e.amt; else d.out += e.amt; }
    const g = (e.profit || 0) + (e.comm || 0); if (e.dir > 0) { d.gIn += g; d.cIn += e.comm || 0; } else { d.gOut += g; d.cOut += e.comm || 0; }
    d.profit += e.profit || 0; d.paid += e.commPaid || 0;
  }
  return days;
}
/* By account: first panel = one line per account, then one panel per account with one line per day.
   Every panel fits the screen width; swipe left / right for the next account. Date / name column stays. */
function repPanels(book, accs, tot, from, to) {
  const anyP = accs.some(x => x.t.gross), anyC = accs.some(x => x.t.comm), anyS = accs.some(x => x.t.settled), anyPaid = accs.some(x => x.t.paid);
  const head = first => `<thead><tr><th class="st">${first}</th><th>${T('வரவு', 'In')}<em>${T('செலவு', 'Out')}</em></th>${anyP ? `<th>${T('வ. லாபம்', 'In profit')}<em>${T('செ. லாபம்', 'Out profit')}</em></th>` : ''}${anyC ? `<th>${T('வ. கமிஷன்', 'In comm.')}<em>${T('செ. கமிஷன்', 'Out comm.')}</em></th>` : ''}${anyPaid ? `<th>${T('கொடுத்தது', 'Paid')}<em>${T('மீதம்', 'Due')}</em></th>` : ''}${anyP || anyS ? `<th>${T('நிகர லாபம்', 'Net profit')}<em>${anyS ? T('எடுத்தது', 'Taken') : ''}</em></th>` : ''}<th>${T('இருப்பு', 'Balance')}</th></tr></thead>`;
  const cells = x => pair(x.inn, x.out, 'in', 'out') + (anyP ? pair(x.gIn, x.gOut, 'in', 'in') : '') + (anyC ? pair(x.cIn, x.cOut, 'out', 'out') : '') + (anyPaid ? pair(x.paid, x.cIn + x.cOut - x.paid, '', 'out') : '') + (anyP || anyS ? pair(x.profit, x.settled, 'in', 'amber') : '');
  const panel = (title, sub, body, foot, k) => `<section class="rp-panel" data-k="${k}"><div class="rp-h"><b>${esc(title)}</b><small>${esc(sub)}</small></div><div class="rt-wrap"><table class="rt rt2 num">${body}${foot}</table></div></section>`;
  const panels = [];
  const multi = accs.length > 1;
  if (multi) {
    const body = head(T('கணக்கு', 'Account')) + `<tbody>${accs.map(({ a, t }) => `<tr class="click" data-go="${accRoute(book, a.id)}"><td class="st"><b>${esc(a.name)}</b></td>${cells(t)}<td class="b ${t.bal < 0 ? 'out' : ''}">${cm(t.bal) || '0'}</td></tr>`).join('')}</tbody>`;
    const foot = `<tfoot><tr><td class="st">${T('மொத்தம்', 'Total')}</td>${cells(tot)}<td class="b">${cm(tot.bal) || '0'}</td></tr></tfoot>`;
    panels.push(panel(T('எல்லா கணக்கும் · சுருக்கம்', 'All accounts · summary'), TP('{n} கணக்குகள்', '{n} accounts', { n: accs.length }), body, foot, 'all'));
  }
  for (const { a, t } of accs) {
    const days = dayRows(t);
    const body = head(T('தேதி', 'Date')) + `<tbody><tr class="rt-open"><td class="st">${T('தொடக்கம்', 'Opening')}</td>${'<td></td>'.repeat(1 + (anyP ? 1 : 0) + (anyC ? 1 : 0) + (anyPaid ? 1 : 0) + (anyP || anyS ? 1 : 0))}<td class="b">${cm(t.open) || '0'}</td></tr>` +
      [...days].map(([date, d]) => `<tr><td class="st">${date.slice(8, 10)}-${date.slice(5, 7)}<small>${date.slice(0, 4)}${d.n > 1 ? ' · ' + d.n : ''}</small></td>${cells(d)}<td class="b ${d.bal < 0 ? 'out' : ''}">${cm(d.bal) || '0'}</td></tr>`).join('') + `</tbody>`;
    const foot = `<tfoot><tr><td class="st">${T('மொத்தம்', 'Total')}</td>${cells(t)}<td class="b">${cm(t.bal) || '0'}</td></tr></tfoot>`;
    panels.push(panel(a.name, `${T('இருப்பு', 'Balance')} ${money(t.bal)}${t.gross || t.settled ? ' · ' + T('கையிருப்பு லாபம்', 'Profit in hand') + ' ' + money(t.inHand) : ''}`, body, foot, a.id));
  }
  const tabs = panels.length > 1 ? `<div class="rp-tabs">${(multi ? [['all', T('சுருக்கம்', 'Summary')]] : []).concat(accs.map(({ a }) => [a.id, a.name])).map(([k, l], i) => `<button class="${i ? '' : 'on'}" data-rp-go="${esc(k)}">${esc(l)}</button>`).join('')}</div>` : '';
  return tabs + `<div class="rp-track">${panels.join('')}</div>`;
}
/* One compact journal line (about 1 cm): date · name / note · amount · profit. */
function jRow(book, e, bal, showAcc) {
  const acc = book.account(e.acc), st = isSettle(e), g = (e.profit || 0) + (e.comm || 0);
  const name = [showAcc && acc ? acc.name : '', e.note || e.party || (st ? T('லாபத்திலிருந்து எடுத்தது', 'Taken from profit') : e.dir > 0 ? T('வரவு', 'In') : T('செலவு', 'Out'))].filter(Boolean).join(' · ');
  return `<button class="jr" data-act="edit-entry" data-id="${esc(e.id)}"><span class="jd">${e.date.slice(8, 10)}-${e.date.slice(5, 7)}<small>${e.time && e.time !== '00:00' ? niceTime(e.time) : e.date.slice(0, 4)}</small></span>
    <span class="jn">${esc(name)}${!counts(e) && !st ? ` <i>${T('இருப்பில் இல்லை', 'not in balance')}</i>` : ''}</span>
    <span class="jp">${g ? `<b class="in">${cmF(g)}</b>` : ''}${e.comm ? `<b class="out">${cmF(e.comm)}</b>` : ''}</span>
    <span class="ja ${st ? 'amber' : e.dir > 0 ? 'in' : 'out'}">${st ? '−' : e.dir > 0 ? '+' : '−'}${cmF(e.amt)}<small>${cmF(bal) || '0'}</small></span></button>`;
}
/* Period chooser: quick ranges as small boxes, and a hotel-booking style calendar for any range. */
function periodPicker(ctx) {
  const cur = ctx.ui.rPeriod, c = ctx.ui.rCustom || ['', ''];
  const quick = PERIODS().filter(([k]) => k !== 'custom');
  const st = { a: c[0] || '', b: c[1] || '', m: (c[0] || today()).slice(0, 7) };
  openSheet(T('எந்த தேதிகள்?', 'Which dates?'), `<div class="pp-grid">${quick.map(([k, l]) => { const r = periodRange(k, c);
      return `<button class="pp-box ${cur === k ? 'on' : ''}" data-e="per" data-k="${k}"><b>${l}</b><small>${r[0] ? esc(r[0] === r[1] ? niceDate(r[0]) : `${niceDate(r[0])} – ${niceDate(r[1])}`) : T('எல்லா நாட்களும்', 'All time')}</small></button>`; }).join('')}</div>
    <div class="section-h"><h2>${T('தேதி தேர்வு', 'Pick dates')}</h2></div>
    <div class="cal card" id="pp-cal"></div>`,
    `<div class="pp-foot"><span id="pp-sum"></span><button class="btn" id="pp-go">${ic('check', 20, 3)}${T('காட்டு', 'Show')}</button></div>`, { tall: true });
  const draw = () => {
    const [y, m] = st.m.split('-').map(Number), first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), lead = (first.getDay() + 6) % 7, td = today();
    let wk = ['தி', 'செ', 'பு', 'வி', 'வெ', 'ச', 'ஞா']; if (locale() !== 'ta-IN') { try { const f = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' }); wk = [1, 2, 3, 4, 5, 6, 7].map(d => f.format(new Date(2024, 0, d))); } catch (e) { wk = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; } }
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, b = st.b || st.a;
      const cls = [iso === st.a ? (st.b && st.b !== st.a ? 'sa rs' : 'sa one') : '', iso === b && st.b && st.b !== st.a ? 'sb' : '', st.a && st.b && iso > st.a && iso < st.b ? 'mid' : '', iso === td ? 'td' : ''].join(' ');
      cells += `<button class="${cls}" data-d="${iso}">${d}</button>`;
    }
    $('#pp-cal').innerHTML = `<div class="cal-h"><button class="icon-btn" data-m="-1" aria-label="prev">${ic('back', 18)}</button><b>${monName(m - 1)} ${y}</b><button class="icon-btn" data-m="1" aria-label="next">${ic('chev', 18)}</button></div><div class="cal-g">${wk.map(w => `<i>${w}</i>`).join('')}${cells}</div>`;
    $('#pp-sum').innerHTML = st.a ? `<small>${T('முதல் – வரை', 'From – to')}</small><b>${esc(niceDate(st.a))} – ${esc(st.b ? niceDate(st.b) : '?')}</b>` : `<small>${T('முதல் நாளைத் தொடவும், பிறகு கடைசி நாளை', 'Tap the first day, then the last day')}</small>`;
    $('#pp-go').disabled = !st.a;
    $('#pp-cal').querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const d = b.dataset.d; if (!st.a || st.b) { st.a = d; st.b = ''; } else if (d < st.a) { st.a = d; } else st.b = d; draw(); });
    $('#pp-cal').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const dt = new Date(y, m - 1 + Number(b.dataset.m), 1); st.m = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; draw(); });
  };
  draw();
  document.querySelectorAll('#sheet-root [data-e=per]').forEach(b => b.onclick = () => { ctx.ui.rPeriod = b.dataset.k; closeSheet(); ctx.render(); });
  $('#pp-go').onclick = () => { ctx.ui.rPeriod = 'custom'; ctx.ui.rCustom = [st.a, st.b || st.a]; closeSheet(); ctx.render(); };
}
if (typeof document !== 'undefined') document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-rp-go]'); if (!b) return; const tr = b.closest('details').querySelector('.rp-track'), p = tr.querySelector(`[data-k="${CSS.escape(b.dataset.rpGo)}"]`); if (p) tr.scrollTo({ left: p.offsetLeft - tr.offsetLeft, behavior: 'smooth' }); b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
if (typeof document !== 'undefined') document.addEventListener('toggle', e => { const k = e.target && e.target.dataset && e.target.dataset.keep; if (k) ls.set(k, e.target.open ? '1' : ''); }, true);
/* Account chooser for the report: full details per account, tick the ones you want. */
function accPicker(ctx, book) {
  const [from, to] = periodRange(ctx.ui.rPeriod, ctx.ui.rCustom);
  const cur = new Set(repIds(ctx, book) || book.accounts.map(a => a.id));
  const rows = book.accounts.map(a => { const t = accountTotals(book, a, from, to); const p = t.gIn || t.gOut || t.settled;
    return `<label class="row rp-row" data-name="${esc(a.name.toLowerCase())}"><input type="checkbox" class="check24" data-rp="${esc(a.id)}" ${cur.has(a.id) ? 'checked' : ''}><span class="tx"><b>${esc(a.name)}</b>
      <small><span class="in">+${moneyAbs(t.inn)}</span> · <span class="out">−${moneyAbs(t.out)}</span>${p ? ` · ${T('லாபம்', 'Profit')} ${money(t.inHand)}` : ''}</small></span><b class="num ${t.bal < 0 ? 'out' : ''}">${money(t.bal)}</b></label>`; }).join('');
  openSheet(T('எந்தக் கணக்குகள்?', 'Which accounts?'), `
    <div class="row2"><button class="btn ghost" data-e="rp-all">${ic('check', 18, 3)}${T('எல்லாம்', 'All')}</button><button class="btn ghost" data-e="rp-none">${ic('x', 18)}${T('ஒன்றும் வேண்டாம்', 'None')}</button></div>
    ${book.accounts.length > 6 ? `<input class="input mt12" id="rp-q" type="search" placeholder="${T('கணக்கைத் தேடு', 'Search accounts')}">` : ''}
    <div class="menu mt12 rp-list">${rows || `<p class="muted pad16">${T('கணக்கு இல்லை', 'No accounts')}</p>`}</div>`,
    `<button class="btn block" id="rp-go">${ic('check', 20, 3)}<span id="rp-n"></span></button>`);
  const boxes = () => [...document.querySelectorAll('#sheet-root [data-rp]')];
  const count = () => { const n = boxes().filter(b => b.checked).length; $('#rp-n').textContent = n === book.accounts.length ? T('எல்லா கணக்கும் காட்டு', 'Show all accounts') : TP('{n} கணக்கு காட்டு', 'Show {n} accounts', { n }); $('#rp-go').disabled = !n; };
  $('#sheet-root .rp-list').onchange = count; count();
  $('#sheet-root [data-e=rp-all]').onclick = () => { boxes().forEach(b => { if (b.closest('.rp-row').style.display !== 'none') b.checked = true; }); count(); };
  $('#sheet-root [data-e=rp-none]').onclick = () => { boxes().forEach(b => { b.checked = false; }); count(); };
  const q = $('#rp-q'); if (q) q.oninput = () => { const v = q.value.trim().toLowerCase(); document.querySelectorAll('#sheet-root .rp-row').forEach(r => { r.style.display = !v || r.dataset.name.includes(v) ? '' : 'none'; }); };
  $('#rp-go').onclick = () => { const sel = boxes().filter(b => b.checked).map(b => b.dataset.rp); ctx.ui.rSel = Object.assign({}, ctx.ui.rSel, { [book.id]: sel.length === book.accounts.length ? [] : sel }); closeSheet(); ctx.render(); };
}
function chart(book, from, to, ids) {
  const list = book.entries.filter(e => counts(e) && (!ids || ids.includes(e.acc)) && (!from || e.date >= from) && (!to || e.date <= to));
  if (!list.length) return `<p class="muted center pad18">${T('இந்த காலத்தில் பதிவு இல்லை', 'No entries in this period')}</p>`;
  const dates = list.map(e => e.date).sort();
  const start = from || dates[0], end = to || dates[dates.length - 1];
  const days = Math.round((new Date(end + 'T12:00') - new Date(start + 'T12:00')) / 864e5) + 1;
  const byMonth = days > 62, buckets = new Map();
  if (byMonth) { let d = new Date(start.slice(0, 7) + '-01T12:00'); const e = end.slice(0, 7); while (ymd(d).slice(0, 7) <= e && buckets.size < 240) { buckets.set(ymd(d).slice(0, 7), [0, 0]); d.setMonth(d.getMonth() + 1); } }
  else for (let i = 0; i < days && i < 62; i++) buckets.set(addDays(start, i), [0, 0]);
  for (const e of list) { const b = buckets.get(byMonth ? e.date.slice(0, 7) : e.date); if (b) b[e.dir > 0 ? 0 : 1] += e.amt; }
  let arr = [...buckets]; if (arr.length > 24 && byMonth) arr = arr.slice(-24);
  const max = Math.max(1, ...arr.map(([, v]) => Math.max(v[0], v[1])));
  const W = 340, H = 150, n = arr.length, bw = W / n, gap = Math.min(4, bw * .2);
  const bars = arr.map(([k, v], i) => {
    const x = i * bw, w = (bw - gap) / 2, hi = v[0] / max * (H - 20), ho = v[1] / max * (H - 20);
    return `<rect x="${(x + gap / 2).toFixed(1)}" y="${(H - 16 - hi).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(hi, v[0] ? 2 : 0).toFixed(1)}" rx="2" fill="var(--in)"><title>${k} +${money(v[0])}</title></rect>
      <rect x="${(x + gap / 2 + w).toFixed(1)}" y="${(H - 16 - ho).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(ho, v[1] ? 2 : 0).toFixed(1)}" rx="2" fill="var(--out)"><title>${k} −${money(v[1])}</title></rect>`;
  }).join('');
  const step = Math.ceil(n / 6);
  const labels = arr.map(([k], i) => i % step ? '' : `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 2}" font-size="10" text-anchor="middle" fill="var(--muted)">${byMonth ? monName(Number(k.slice(5, 7)) - 1) : Number(k.slice(8))}</text>`).join('');
  return `<div class="legend"><span><i class="dot in"></i> ${T('வரவு', 'In')}</span><span><i class="dot out"></i> ${T('செலவு', 'Out')}</span><span class="ml-auto">${byMonth ? T('மாதம்', 'Monthly') : T('நாள்', 'Daily')}</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${T('வரவு செலவு வரைபடம்', 'In and out chart')}"><line x1="0" x2="${W}" y1="${H - 16}" y2="${H - 16}" stroke="var(--line)"/>${bars}${labels}</svg>`;
}

/* ---------------- Entry sheet ---------------- */
export function entrySheet(ctx, book, opts) {
  const edit = opts.id ? book.entries.find(e => e.id === opts.id) : null;
  const readOnly = !book.canEdit || (edit && edit.locked);
  const accounts = book.accounts.filter(a => !a.archived && !a.locked);
  const lastAcc = ls.get('tl4-last-acc:' + book.id, '');
  const f = edit ? Object.assign({}, edit, { files: (edit.files || []).slice() }) : {
    dir: opts.dir || 1, amt: 0, acc: opts.acc || (accounts.length === 1 ? accounts[0].id : (book.account(lastAcc) ? lastAcc : '')),
    date: today(), time: nowTime(), note: '', party: '', files: [], rate: null, commRate: null
  };
  const st = { expr: edit ? String(edit.amt / 100) : '', more: !!(edit && (edit.rate != null || (edit.files && edit.files.length) || edit.commRate != null || edit.party)), newAcc: !accounts.length && book.canEdit, newName: '', pending: [] };
  const amountNow = () => exprToPaise(st.expr);
  function draw() {
    const amt = amountNow(); f.amt = amt;
    const acc = book.account(f.acc);
    const suggestions = readOnly ? [] : suggestNotes(book, f.acc, f.dir);
    const title = readOnly ? T('பதிவு', 'Entry') : edit ? T('பதிவைத் திருத்து', 'Edit entry') : (f.dir > 0 ? T('பணம் வந்தது', 'Money in') : T('பணம் போனது', 'Money out'));
    const dr = dirRates(acc, f.dir);
    const rate = f.rate != null ? f.rate : dr.rate;
    const commRate = f.commRate != null ? f.commRate : dr.comm;
    const pr = calcProfit(acc, amt || 0, f.rate, f.commRate, f.dir);
    const dis = readOnly ? 'disabled' : '';
    const body = `
      ${edit && edit.locked ? `<div class="row card rounded mb12"><span class="ic amber">${ic('info')}</span><span class="tx"><b>${T('பார்க்க மட்டும்', 'View only')}</b><small>${T('இது பழைய ஆப்பின் சிறப்புப் பதிவு (Hold / In+Out / Fund). அதை பழைய ஆப்பில் திருத்தவும்.', 'This is a special record from the old app (Hold / In+Out / Fund). Edit it in the old app.')}</small></span></div>` : ''}
      <div class="dirs"><button class="in ${f.dir > 0 ? 'on' : ''}" data-e="dir" data-v="1" ${dis}>${ic('down', 20, 2.6)}${T('வரவு', 'In')}</button><button class="out ${f.dir < 0 ? 'on' : ''}" data-e="dir" data-v="-1" ${dis}>${ic('up', 20, 2.6)}${T('செலவு', 'Out')}</button></div>
      <div class="amount-box ${f.dir > 0 ? 'in' : 'out'}"><div class="val num ${f.dir > 0 ? 'in' : 'out'}"><span class="cur">₹</span>${st.expr ? esc(nf.format((amt || 0) / 100)) : '0'}</div><div class="expr num">${st.expr.includes('+') ? esc(st.expr.replace(/\+/g, ' + ')) : readOnly ? '' : T('தொகையை அடிக்கவும்', 'Type the amount')}</div></div>
      ${readOnly ? '' : `<div class="keypad" aria-label="keypad">${['1', '2', '3', '⌫', '4', '5', '6', '+', '7', '8', '9', 'ok', '.', '0', '00'].map(k => k === 'ok'
        ? `<button class="key ok" data-e="key" data-k="ok" aria-label="${T('சேமி', 'Save')}">${ic('check', 30, 3)}</button>`
        : `<button class="key ${k === '⌫' || k === '+' ? 'op' : ''}" data-e="key" data-k="${k}">${k}</button>`).join('')}</div>`}
      <div class="field"><span class="lbl">${T('கணக்கு', 'Account')}</span>
        <div class="picker">${(readOnly ? accounts.filter(a => a.id === f.acc) : accounts).map(a => `<button class="pick ${f.acc === a.id && !st.newAcc ? 'on' : ''}" data-e="acc" data-id="${esc(a.id)}" ${dis}>${avatar(a.name)}<span class="n">${esc(a.name)}</span></button>`).join('')}
        ${readOnly ? '' : `<button class="pick new ${st.newAcc ? 'on' : ''}" data-e="newacc">${ic('plus', 18, 2.6)}${T('புதிது', 'New')}</button>`}</div>
        ${st.newAcc ? `<input class="input mt8" id="new-acc" placeholder="${T('புதிய கணக்கின் பெயர்', 'New account name')}" value="${esc(st.newName)}" maxlength="80">` : ''}
      </div>
      <div class="field"><label for="note">${T('குறிப்பு (விருப்பம்)', 'Note (optional)')}</label>
        <input class="input" id="note" value="${esc(f.note)}" maxlength="500" ${dis} placeholder="${f.dir > 0 ? T('உதா: விற்பனை, திரும்ப வந்தது', 'e.g. Sales, Returned') : T('உதா: சரக்கு, சம்பளம், வாடகை', 'e.g. Stock, Salary, Rent')}">
        ${suggestions.length ? `<div class="picker mt8">${suggestions.map(s => `<button class="chip" data-e="sug" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="field"><span class="lbl">${T('தேதி', 'Date')}</span>
        <div class="picker"><button class="chip ${f.date === today() ? 'on' : ''}" data-e="date" data-v="${today()}" ${dis}>${T('இன்று', 'Today')}</button><button class="chip ${f.date === addDays(today(), -1) ? 'on' : ''}" data-e="date" data-v="${addDays(today(), -1)}" ${dis}>${T('நேற்று', 'Yesterday')}</button>
        <label class="chip rel ${f.date !== today() && f.date !== addDays(today(), -1) ? 'on' : ''}">${ic('cal', 18)}${f.date !== today() && f.date !== addDays(today(), -1) ? niceDate(f.date) : T('வேறு நாள்', 'Other day')}<input type="date" id="date" value="${f.date}" class="cover-input" ${dis}></label></div>
      </div>
      ${st.more ? `
      <div class="row2">
        <div class="field"><label for="time">${T('நேரம்', 'Time')}</label><input class="input" type="time" id="time" value="${f.time || ''}" ${dis}></div>
        <div class="field"><label for="party">${T('யாரிடம் / யாருக்கு', 'From / to whom')}</label><input class="input" id="party" value="${esc(f.party)}" maxlength="80" ${dis}></div>
      </div>
      <div class="row2">
        <div class="field"><label for="rate">${T('லாபம் %', 'Profit %')}</label><input class="input" type="number" inputmode="decimal" step="0.01" min="0" max="100" id="rate" value="${rate ? rate / 100 : ''}" data-init="${rate ? rate / 100 : ''}" placeholder="0" ${dis}></div>
        <div class="field"><label for="comm">${T('கமிஷன் %', 'Commission %')}</label><input class="input" type="number" inputmode="decimal" step="0.01" min="0" max="100" id="comm" value="${commRate ? commRate / 100 : ''}" data-init="${commRate ? commRate / 100 : ''}" placeholder="0" ${dis}></div>
      </div>
      ${(rate || commRate) && amt && !edit?.imported ? `<div class="calc-preview">${T('லாபம்', 'Profit')}: ${money(pr.gross)}${pr.comm ? ` − ${T('கமிஷன்', 'commission')} ${money(pr.comm)} = ${T('நிகர லாபம்', 'Net profit')} ${money(pr.profit)}` : ''}</div>` : ''}
      ${edit && edit.imported && (edit.profit || edit.comm) ? `<div class="calc-preview">${T('லாபம்', 'Profit')}: ${money(edit.profit)}${edit.comm ? ' · ' + T('கமிஷன்', 'commission') + ' ' + money(edit.comm) : ''}${edit.commPaid ? ' · ' + T('செலுத்தியது', 'paid') + ' ' + money(edit.commPaid) : ''}</div>` : ''}
      <div class="field"><span class="lbl">${T('படம் / ரசீது', 'Photo / receipt')}</span>
        <div class="files">${f.files.map((x, i) => `<span class="file">📎<span>${esc(x.name)}</span><button data-e="open-file" data-i="${i}" aria-label="open">${ic('search', 16)}</button>${readOnly ? '' : `<button data-e="rm-file" data-i="${i}" aria-label="remove">${ic('x', 16)}</button>`}</span>`).join('')}
        ${f.files.length < 5 && !readOnly ? `<button class="chip" data-e="attach">${ic('clip', 18)}${T('இணை', 'Attach')}</button>` : ''}</div></div>
      ${edit && (edit.noBal || edit.pending) && !readOnly && book.kind === 'local' ? `<label class="row card rounded mt14"><span class="tx"><b>${edit.pending ? T('நிலுவையில் (இருப்பில் சேர்க்கவில்லை)', 'Pending (not in balance)') : T('இருப்பில் சேர்க்கவில்லை', 'Not counted in balance')}</b><small>${T('இருப்பில் சேர்க்க டிக் செய்யவும்', 'Tick to count it in the balance')}</small></span><input type="checkbox" id="countit" class="check24"></label>` : ''}
      ` : `<button class="more-toggle" data-e="more">${ic('plus', 18)}${T('நேரம், லாபம் %, படம்…', 'Time, profit %, photo…')}</button>`}
      ${edit && !readOnly ? `<button class="btn danger block mt18" data-e="delete">${ic('trash', 20)}${T('இந்தப் பதிவை நீக்கு', 'Delete this entry')}</button>` : ''}`;
    const sheet = $('#sheet-root .sheet');
    if (!sheet || !sheetState || !sheetState.entry) {
      openSheet(title, body, readOnly ? '' : `<button class="btn block save-btn ${f.dir > 0 ? 'in-bg' : 'out-bg'}" data-e="save">${ic('check', 22, 3)}${T('சேமி', 'Save')}</button>`, { entry: true, tall: true });
      wire();
    } else {
      sheet.querySelector('header h3').textContent = title;
      const b = sheet.querySelector('.body'), top = b.scrollTop; b.innerHTML = body; b.scrollTop = top;
      const sb = sheet.querySelector('[data-e="save"]'); if (sb) sb.className = 'btn block save-btn ' + (f.dir > 0 ? 'in-bg' : 'out-bg');
    }
    sheetState.entryKey = readOnly ? null : key;
  }
  function readInputs() {
    const g = id => $('#' + id);
    if (g('note')) f.note = g('note').value.trim();
    if (g('new-acc')) st.newName = g('new-acc').value;
    if (g('time')) f.time = g('time').value || '00:00';
    if (g('party')) f.party = g('party').value.trim();
    const pct = (el, k) => { if (!el || el.value === el.dataset.init) return; const v = el.value.trim(); f[k] = v === '' ? (dirRates(book.account(f.acc), f.dir)[k === 'rate' ? 'rate' : 'comm'] ? 0 : null) : pctToBp(v); el.dataset.init = el.value; };
    pct(g('rate'), 'rate'); pct(g('comm'), 'commRate');
  }
  function key(k) {
    if (k === 'ok') return doSave();
    if (k === '⌫') st.expr = st.expr.slice(0, -1);
    else if (k === '+') { if (st.expr && !st.expr.endsWith('+') && !st.expr.endsWith('.')) st.expr += '+'; }
    else if (k === '.') { const last = st.expr.split('+').pop(); if (!last.includes('.')) st.expr += last ? '.' : '0.'; }
    else {
      const last = st.expr.split('+').pop();
      if (last.includes('.') && last.split('.')[1].length + k.length > 2) return;
      if (last.replace('.', '').length >= 11) return;
      if (last === '0' && k !== '.') st.expr = st.expr.slice(0, -1);
      st.expr += k; if (st.expr === '00') st.expr = '0';
    }
    readInputs(); draw();
  }
  let saving = false;
  async function doSave() {
    if (saving) return;
    readInputs();
    const amt = amountNow();
    if (!amt || amt <= 0 || !Number.isSafeInteger(amt) || amt > 1e14) { toast(T('தொகையை அடிக்கவும்', 'Please type the amount')); return; }
    saving = true;
    try {
      let accId = f.acc;
      if (st.newAcc || !accId) {
        const name = (st.newName || '').trim();
        if (!name) { toast(T('கணக்கைத் தேர்ந்தெடுக்கவும் அல்லது பெயர் அடிக்கவும்', 'Choose an account or type a name')); st.newAcc = true; draw(); setTimeout(() => $('#new-acc') && $('#new-acc').focus(), 50); return; }
        const existing = book.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
        if (existing) accId = existing.id;
        else { const a = { id: uid(), name: name.slice(0, 80), phone: '', opening: 0, rate: 0, commRate: 0, note: '', created: Date.now() }; await book.putAccount(a); accId = a.id; }
      }
      const acc = book.account(accId);
      const changedMoney = !edit || edit.amt !== amt || edit.dir !== f.dir || (edit.rate ?? null) !== (f.rate ?? null) || (edit.commRate ?? null) !== (f.commRate ?? null) || edit.acc !== accId;
      const pr = changedMoney || !edit.imported ? calcProfit(acc, amt, f.rate, f.commRate, f.dir) : { profit: edit.profit, comm: edit.comm };
      const rec = {
        id: edit ? edit.id : uid(), acc: accId, dir: f.dir, amt, date: f.date || today(), time: f.time || '00:00', note: f.note, party: f.party,
        cat: edit ? edit.cat || '' : '', rate: f.rate ?? null, commRate: f.commRate ?? null, profit: pr.profit, comm: pr.comm, files: f.files,
        created: edit ? edit.created : Date.now(), updated: Date.now()
      };
      if (edit) {
        ['imported', 'commPaid', 'noBal', 'pending'].forEach(k => { if (edit[k] !== undefined) rec[k] = edit[k]; });
        const c = $('#countit'); if (c && c.checked) { delete rec.noBal; delete rec.pending; }
      }
      await book.putEntry(rec, st.pending);
      ls.set('tl4-last-acc:' + book.id, accId);
      closeSheet(); ctx.render();
      toast((rec.dir > 0 ? T('வரவு சேமிக்கப்பட்டது', 'Money in saved') : T('செலவு சேமிக்கப்பட்டது', 'Money out saved')) + ' · ' + moneyAbs(amt));
    } catch (e) { toast(ctx.errorText(e)); }
    finally { saving = false; }
  }
  function wire() {
    const sheet = $('#sheet-root .sheet');
    sheet.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-e]'); if (!b || b.disabled) return;
      const e = b.dataset.e;
      if (e === 'key') { key(b.dataset.k); return; }
      if (e === 'open-file') { const x = f.files[Number(b.dataset.i)]; const p = st.pending.find(y => y.id === x.id); openFileData(x, p ? p.data : await book.getFile(x)); return; }
      if (readOnly) return;
      readInputs();
      if (e === 'dir') { f.dir = Number(b.dataset.v); draw(); }
      else if (e === 'acc') { f.acc = b.dataset.id; st.newAcc = false; draw(); }
      else if (e === 'newacc') { st.newAcc = true; f.acc = ''; draw(); setTimeout(() => $('#new-acc') && $('#new-acc').focus(), 50); }
      else if (e === 'sug') { f.note = b.dataset.v; draw(); }
      else if (e === 'date') { f.date = b.dataset.v; draw(); }
      else if (e === 'more') { st.more = true; draw(); }
      else if (e === 'save') doSave();
      else if (e === 'attach') { const picked = await pickFiles('image/*,application/pdf', true, 5 - f.files.length); for (const p of picked) { st.pending.push(p); f.files.push({ id: p.id, name: p.data.name, mime: p.data.mime }); } draw(); }
      else if (e === 'rm-file') { f.files.splice(Number(b.dataset.i), 1); draw(); }
      else if (e === 'delete') {
        if (!await confirmBox(T('நீக்கவா?', 'Delete?'), T('இந்தப் பதிவு நீக்கப்படும்.', 'This entry will be deleted.'), T('நீக்கு', 'Delete'), true)) return;
        try {
          const undo = await book.deleteEntry(edit.id); ctx.render();
          if (undo) toast(T('நீக்கப்பட்டது', 'Deleted'), { label: T('திரும்பப் பெறு', 'Undo'), fn: async () => { await undo(); ctx.render(); } });
          else toast(T('நீக்கப்பட்டது', 'Deleted'));
        } catch (x) { toast(ctx.errorText(x)); }
      }
    });
    sheet.addEventListener('change', ev => { if (ev.target.id === 'date' && ev.target.value) { readInputs(); f.date = ev.target.value; draw(); } else if (['rate', 'comm'].includes(ev.target.id)) { readInputs(); draw(); } });
  }
  draw();
}

/* ---------------- Account sheet & menu ---------------- */
export function accountSheet(ctx, book, a) {
  const edit = !!a;
  a = a || { name: '', phone: '', opening: 0, rate: 0, commRate: 0, fin: null, note: '' };
  const group = book.kind === 'group';
  const body = `
    <div class="field"><label for="a-name">${T('பெயர்', 'Name')} *</label><input class="input" id="a-name" maxlength="80" value="${esc(a.name)}" placeholder="${T('உதா: முருகன், கடை, வீட்டுச் செலவு', 'e.g. Murugan, Shop, Home')}"></div>
    ${group ? '' : `<div class="field"><label for="a-phone">${T('போன் (விருப்பம்)', 'Phone (optional)')}</label><input class="input" id="a-phone" type="tel" inputmode="tel" maxlength="20" value="${esc(a.phone || '')}"></div>`}
    <div class="field"><label for="a-open">${T('தொடக்க இருப்பு (விருப்பம்)', 'Opening balance (optional)')}</label>
      <div class="flex8"><span class="seg"><button type="button" id="a-sign-p" class="${a.opening >= 0 ? 'on' : ''}">+</button><button type="button" id="a-sign-m" class="${a.opening < 0 ? 'on' : ''}">−</button></span>
      <input class="input" id="a-open" type="number" inputmode="decimal" step="0.01" min="0" value="${a.opening ? Math.abs(a.opening) / 100 : ''}" placeholder="0"></div>
      <p class="note">${T('ஏற்கனவே இருக்கும் பணம் அல்லது பாக்கி. + = கையில் / வர வேண்டியது, − = கொடுக்க வேண்டியது.', 'Money you already have or owe. + = have / to receive, − = to pay.')}</p></div>
    <details class="mt14" ${hasRates(a) ? 'open' : ''}><summary class="summary">${T('வியாபாரத்துக்கு: லாபம் / கமிஷன் %', 'For business: profit / commission %')}</summary>
      ${(() => { const r = accRates(a), v = k => r[k] ? r[k] / 100 : '', fld = (k, ta, en) => `<div class="field"><label for="a-${k}">${T(ta, en)}</label><input class="input" id="a-${k}" type="number" inputmode="decimal" step="0.01" min="0" max="100" value="${v(k)}" placeholder="0"></div>`;
        return `<div class="row2">${fld('inProfit', 'வரவு லாபம் % (விருப்பம்)', 'In profit % (optional)')}${fld('outProfit', 'செலவு லாபம் % (விருப்பம்)', 'Out profit % (optional)')}</div>
      <div class="row2">${fld('inComm', 'வரவு கொடுக்க வேண்டிய கமிஷன் % (விருப்பம்)', 'In payable commission % (optional)')}${fld('outComm', 'செலவு கொடுக்க வேண்டிய கமிஷன் % (விருப்பம்)', 'Out payable commission % (optional)')}</div>`; })()}
      <p class="note">${T('ஒவ்வொரு பதிவிலும் லாபம் = தொகை × லாபம் % − தொகை × கமிஷன் %. வரவுக்கும் செலவுக்கும் தனித்தனியாக.', 'Profit for every entry = amount × profit % − amount × commission % — separately for money in and money out.')}</p></details>
    ${edit ? `<button class="btn danger block mt18" id="a-del">${ic('trash', 20)}${T('இந்தக் கணக்கை நீக்கு', 'Delete this account')}</button>` : ''}`;
  openSheet(edit ? T('கணக்கைத் திருத்து', 'Edit account') : T('புதிய கணக்கு', 'New account'), body, `<button class="btn block" id="a-save">${ic('check', 22, 3)}${T('சேமி', 'Save')}</button>`);
  let neg = a.opening < 0;
  $('#a-sign-p').onclick = () => { neg = false; $('#a-sign-p').classList.add('on'); $('#a-sign-m').classList.remove('on'); };
  $('#a-sign-m').onclick = () => { neg = true; $('#a-sign-m').classList.add('on'); $('#a-sign-p').classList.remove('on'); };
  setTimeout(() => { if (!edit) $('#a-name') && $('#a-name').focus(); }, 280);
  $('#a-save').onclick = async () => {
    const name = $('#a-name').value.trim();
    if (!name) { toast(T('பெயர் தேவை', 'Name is required')); $('#a-name').focus(); return; }
    const open = Math.round(Math.abs(Number($('#a-open').value || 0)) * 100) * (neg ? -1 : 1);
    const rec = Object.assign({}, a, { name, phone: $('#a-phone') ? $('#a-phone').value.trim() : '', opening: Number.isSafeInteger(open) ? open : 0, rate: 0, commRate: 0 });
    const fin = {}; RATE_KEYS.forEach(k => { fin[k] = pctToBp($('#a-' + k).value) || 0; });
    rec.fin = fin; rec.rate = fin.inProfit; rec.commRate = fin.inComm;
    // Entries that follow this account's % (no own %) can be recalculated with the new %.
    const before = accRates(a), changed = edit && RATE_KEYS.some(k => before[k] !== fin[k]);
    const follow = changed && book.kind === 'local' ? book.entries.filter(e => e.acc === a.id && !e.imported && !isSettle(e) && e.rate == null && e.commRate == null) : [];
    if (!edit) { rec.id = uid(); rec.created = Date.now(); }
    $('#a-save').disabled = true;
    try {
      await book.putAccount(rec);
      if (follow.length && await confirmBox(T('பழைய பதிவுகளுக்கும் புதிய %?', 'Apply the new % to old entries?'), TP('இந்தக் கணக்கின் % பயன்படுத்தும் {n} பதிவுகளின் லாபம் புதிய %-படி மாற்றப்படும். தனி % கொடுத்த பதிவுகள் மாறாது.', 'Profit of {n} entries that use this account’s % will be recalculated. Entries with their own % stay as they are.', { n: follow.length }), T('பொருத்து', 'Apply'))) {
        for (const e of follow) { const pr = calcProfit(rec, e.amt, null, null, e.dir); await book.putEntry(Object.assign({}, e, { profit: pr.profit, comm: pr.comm, updated: Date.now() }), []); }
      }
      closeSheet(); if (!edit) ctx.go(accRoute(book, rec.id)); else ctx.render(); toast(T('சேமிக்கப்பட்டது', 'Saved'));
    }
    catch (e) { toast(ctx.errorText(e)); $('#a-save').disabled = false; }
  };
  if (edit) $('#a-del').onclick = async () => {
    const n = book.entries.filter(e => e.acc === a.id).length;
    if (!await confirmBox(T('கணக்கை நீக்கவா?', 'Delete account?'), TP('“{a}” மற்றும் அதன் {n} பதிவுகள் நீக்கப்படும்.', '“{a}” and its {n} entries will be deleted.', { a: a.name, n }), T('நீக்கு', 'Delete'), true)) return;
    try {
      const undo = await book.deleteAccount(a.id); ctx.go(book.prefix.replace(/-$/, ''));
      if (undo) toast(T('கணக்கு நீக்கப்பட்டது', 'Account deleted'), { label: T('திரும்பப் பெறு', 'Undo'), fn: async () => { await undo(); ctx.render(); } });
    } catch (e) { toast(ctx.errorText(e)); }
  };
}
export function accountMenu(ctx, book, a) {
  openSheet(a.name, `<div class="menu">
    ${book.canEdit && !a.locked ? `<button class="row" data-act="acc-edit" data-id="${esc(a.id)}"><span class="ic">${ic('edit')}</span><span class="tx"><b>${T('கணக்கைத் திருத்து', 'Edit account')}</b><small>${T('பெயர், தொடக்க இருப்பு, லாபம் %', 'Name, opening balance, profit %')}</small></span></button>` : ''}
    ${book.canEdit && !a.locked ? `<button class="row" data-act="acc-import" data-id="${esc(a.id)}"><span class="ic green">${ic('down')}</span><span class="tx"><b>${T('கோப்பிலிருந்து பதிவுகளைச் சேர்', 'Import entries from a file')}</b><small>PDF · Excel · CSV</small></span></button>` : ''}
    ${(() => { if (!book.canEdit || a.locked) return ''; const last = lastImport(book, a.id); return last ? `<button class="row" data-act="acc-unimport" data-id="${esc(a.id)}"><span class="ic red">${ic('trash')}</span><span class="tx"><b>${T('கடைசியாக இறக்கியதை நீக்கு', 'Remove the last import')}</b><small>${esc(last.name)} · ${TP('{n} பதிவுகள்', '{n} entries', { n: last.ids.length })}</small></span></button>` : ''; })()}
    <button class="row" data-act="acc-pdf" data-id="${esc(a.id)}"><span class="ic">${ic('pdf')}</span><span class="tx"><b>${T('PDF அறிக்கை', 'PDF statement')}</b></span></button>
    <button class="row" data-act="acc-share" data-id="${esc(a.id)}"><span class="ic green">${ic('share')}</span><span class="tx"><b>${T('இருப்பை அனுப்பு (WhatsApp)', 'Send balance (WhatsApp)')}</b></span></button>
    ${a.phone && !native.any ? `<a class="row link-row" href="tel:${esc(a.phone)}"><span class="ic">${ic('phone')}</span><span class="tx"><b>${T('அழை', 'Call')} ${esc(a.phone)}</b></span></a>` : ''}
  </div>`);
}
/** Latest import batch of an account → { name, ids } (ids are the stored entry ids). */
function lastImport(book, accId) {
  const by = new Map();
  for (const e of book.entries) if (e.acc === accId && e.imp && e.imp.batchId) { let b = by.get(e.imp.batchId); if (!b) { b = { id: e.imp.batchId, name: e.imp.fileName || '', at: 0, ids: new Set() }; by.set(b.id, b); } b.at = Math.max(b.at, e.created || 0); b.ids.add(e.id.replace(/-(in|out)$/, '')); }
  const last = [...by.values()].sort((x, y) => y.at - x.at)[0];
  return last ? { name: last.name, ids: [...last.ids] } : null;
}
export function accountShareText(book, a) {
  const t = accountTotals(book, a, '', '');
  const last = t.rows.slice(-5).reverse();
  return `${a.name}\n${T('இருப்பு', 'Balance')}: ${money(t.bal)}\n${T('மொத்த வரவு', 'Total in')}: ${money(t.inn)} · ${T('மொத்த செலவு', 'Total out')}: ${money(t.out)}\n\n` +
    (last.length ? T('கடைசி பதிவுகள்:', 'Recent entries:') + '\n' + last.map(({ e }) => `${dmy(e.date).replace(/-/g, '/')}  ${e.dir > 0 ? '+' : '−'}${moneyAbs(e.amt)}  ${e.note || ''}`).join('\n') + '\n\n' : '') + '— Team Ledger';
}

/* ---------------- PDF & CSV ---------------- */
/* PDF columns the user can tick on / off (remembered on this device). */
const PDF_COLS = () => [
  ['open', T('தொடக்க இருப்பு', 'Opening balance')], ['inn', T('வரவு', 'Money in')], ['out', T('செலவு', 'Money out')],
  ['gIn', T('வரவு லாபம்', 'In profit')], ['gOut', T('செலவு லாபம்', 'Out profit')], ['cIn', T('வரவு கமிஷன்', 'In commission')], ['cOut', T('செலவு கமிஷன்', 'Out commission')], ['net', T('நிகர லாபம்', 'Net profit')],
  ['settled', T('லாபத்திலிருந்து எடுத்தது', 'Taken from profit')], ['inHand', T('கையிருப்பு லாபம்', 'Profit in hand')], ['bal', T('இருப்பு', 'Balance')],
  ['note', T('விவரம் / குறிப்பு', 'Details / note')]
];
const pdfPrefs = () => { try { return JSON.parse(ls.get('tl4-pdf-cols', '{}')) || {}; } catch (e) { return {}; } };
export function pdfOptions(ctx, book, accIds, from, to, title) {
  const per = book.accounts.filter(a => !accIds || accIds.includes(a.id)).map(a => accountTotals(book, a, from, to));
  const has = { gIn: per.some(t => t.gIn), gOut: per.some(t => t.gOut), cIn: per.some(t => t.cIn), cOut: per.some(t => t.cOut), net: per.some(t => t.gross), settled: per.some(t => t.settled), inHand: per.some(t => t.gross || t.settled), note: accIds && accIds.length === 1 };
  const pref = pdfPrefs();
  const cols = PDF_COLS().filter(([k]) => has[k] !== false && (has[k] === undefined || has[k]));
  openSheet(T('PDF-ல் என்ன காட்ட வேண்டும்?', 'What should the PDF show?'), `<div class="menu">${cols.map(([k, label]) => `<label class="row"><span class="tx"><b>${label}</b></span><input type="checkbox" class="check24" data-col="${k}" ${pref[k] === false ? '' : 'checked'}></label>`).join('')}</div>
    <p class="note">${T('ஒரே A4 பக்கத்தில் பொருந்தும்படி தானாக அளவு மாறும்.', 'It is sized automatically to fit one A4 page.')}</p>`,
    `<button class="btn block" id="pdf-go">${ic('pdf', 20)}${T('PDF எடு', 'Make PDF')}</button>`);
  $('#pdf-go').onclick = () => {
    const p2 = pdfPrefs(); document.querySelectorAll('#sheet-root [data-col]').forEach(el => { p2[el.dataset.col] = el.checked; }); ls.set('tl4-pdf-cols', JSON.stringify(p2));
    closeSheet(true); printReport(ctx, book, accIds, from, to, title, p2);
  };
}
export function printReport(ctx, book, accIds, from, to, title, prefs) {
  const pref = prefs || pdfPrefs(), on = k => pref[k] !== false;
  const accs = book.accounts.filter(a => !accIds || accIds.includes(a.id));
  const tot = allTotals(book, from, to, accIds);
  const range = from || to ? `${dmy(from) || '…'} → ${dmy(to) || '…'}` : T('எல்லா நாட்களும்', 'All time');
  const per = accs.map(a => ({ a, t: accountTotals(book, a, from, to) }));
  const any = k => per.some(x => x.t[k]), anyP = per.some(x => x.t.gross || x.t.settled);
  const C = { open: on('open'), inn: on('inn'), out: on('out'), gIn: any('gIn') && on('gIn'), gOut: any('gOut') && on('gOut'), cIn: any('cIn') && on('cIn'), cOut: any('cOut') && on('cOut'), net: any('gross') && on('net'), settled: any('settled') && on('settled'), inHand: anyP && on('inHand'), bal: on('bal'), note: on('note') };
  C.gross = C.gIn || C.gOut; C.comm = C.cIn || C.cOut;
  const L = { inn: T('வரவு', 'Money in'), out: T('செலவு', 'Money out'), bal: T('இருப்பு', 'Balance'), gIn: T('வரவு லாபம்', 'In profit'), gOut: T('செலவு லாபம்', 'Out profit'), cIn: T('வரவு கமிஷன்', 'In commission'), cOut: T('செலவு கமிஷன்', 'Out commission'), net: T('நிகர லாபம்', 'Net profit'), settled: T('லாபத்திலிருந்து எடுத்தது', 'Taken from profit'), inHand: T('கையிருப்பு லாபம்', 'Profit in hand') };
  const box = (k, v, cls) => C[k] ? `<div><small>${L[k]}</small><b class="${cls || ''}">${money(v)}</b></div>` : '';
  const m0 = v => v ? money(v) : '';
  // Boxed totals under the table: every figure the top boxes have, plus opening balance.
  const endBoxes = (t, head) => `<div class="pr-end"><h3>${esc(head)}</h3><div class="pr-sum">${C.open ? `<div><small>${T('தொடக்க இருப்பு', 'Opening balance')}</small><b>${money(t.open)}</b></div>` : ''}${[['inn', t.inn, 'pr-in'], ['out', t.out, 'pr-out'], ['gIn', t.gIn], ['gOut', t.gOut], ['cIn', t.cIn, 'pr-out'], ['cOut', t.cOut, 'pr-out'], ['net', t.profit, 'pr-in'], ['settled', t.settled], ['inHand', t.inHand, 'pr-in'], ['bal', t.bal]].map(([k, v, c]) => box(k, v, c)).join('')}</div></div>`;
  let html = `<div class="pr-h"><div><h1>${esc(title)}</h1><p>${esc(range)}${book.kind === 'group' ? ' · ' + esc(book.name) : ''}</p></div><p>Team Ledger · ${new Date().toLocaleString(locale())}</p></div>
    <div class="pr-sum">${box('inn', tot.inn, 'pr-in')}${box('out', tot.out, 'pr-out')}${box('gIn', tot.gIn)}${box('gOut', tot.gOut)}${box('cIn', tot.cIn, 'pr-out')}${box('cOut', tot.cOut, 'pr-out')}${box('net', tot.profit, 'pr-in')}${box('settled', tot.settled)}${box('inHand', tot.inHand, 'pr-in')}${box('bal', tot.bal)}</div>`;
  if (accs.length > 1) {
    // One-page summary: one row per account, sized to fit a single A4 sheet.
    const cols = [
      ['open', T('தொடக்கம்', 'Opening'), t => m0(t.open), ''], ['inn', T('வரவு', 'In'), t => m0(t.inn), 'pr-in'], ['out', T('செலவு', 'Out'), t => m0(t.out), 'pr-out'],
      ['gIn', L.gIn, t => m0(t.gIn), ''], ['gOut', L.gOut, t => m0(t.gOut), ''], ['cIn', L.cIn, t => m0(t.cIn), 'pr-out'], ['cOut', L.cOut, t => m0(t.cOut), 'pr-out'], ['net', L.net, t => t.gross ? money(t.profit) : '', 'pr-in'],
      ['settled', T('எடுத்தது', 'Taken'), t => m0(t.settled), ''], ['inHand', T('கையிருப்பு', 'In hand'), t => t.gross || t.settled ? money(t.inHand) : '', 'pr-in'], ['bal', T('இருப்பு', 'Balance'), t => `<b>${money(t.bal)}</b>`, '']
    ].filter(c => C[c[0]]);
    const sum = { open: tot.open, inn: tot.inn, out: tot.out, gIn: tot.gIn, gOut: tot.gOut, cIn: tot.cIn, cOut: tot.cOut, net: tot.profit, settled: tot.settled, inHand: tot.inHand, bal: tot.bal };
    html += `<table class="pr-t ${cols.length > 7 ? 'pr-wide' : ''}"><thead><tr><th>#</th><th>${T('கணக்கு', 'Account')}</th>${cols.map(c => `<th class="r">${c[1]}</th>`).join('')}</tr></thead><tbody>
      ${per.map(({ a, t }, i) => `<tr><td>${i + 1}</td><td>${esc(a.name)}</td>${cols.map(c => `<td class="r ${c[3]}">${c[2](t)}</td>`).join('')}</tr>`).join('')}
      <tr class="pr-total"><td></td><td><b>${T('மொத்தம்', 'Total')}</b></td>${cols.map(c => `<td class="r ${c[3]}"><b>${money(sum[c[0]])}</b></td>`).join('')}</tr></tbody></table>`;
    html += endBoxes(tot, TP('மொத்தம் · {n} கணக்குகள்', 'Total · {n} accounts', { n: accs.length }));
  } else {
    for (const { a, t } of per) {
      const cols = [
        ['inn', T('வரவு', 'In'), (e) => e.dir > 0 && !isSettle(e) ? money(e.amt) : '', 'pr-in', t.inn], ['out', T('செலவு', 'Out'), (e) => e.dir < 0 && !isSettle(e) ? money(e.amt) : '', 'pr-out', t.out],
        ['gross', T('லாபம்', 'Profit'), (e) => isSettle(e) ? '−' + moneyAbs(e.amt) : m0((e.profit || 0) + (e.comm || 0)), '', t.gross - t.settled], ['comm', T('கமிஷன்', 'Commission'), (e) => m0(e.comm), 'pr-out', t.comm],
        ['bal', T('இருப்பு', 'Balance'), (e, bal) => money(bal), '', t.bal]
      ].filter(c => C[c[0]]);
      html += `<h2 class="pr-acc">${esc(a.name)} <small>${C.open ? '· ' + T('தொடக்கம்', 'Opening') + ' ' + money(t.open) + ' ' : ''}· ${T('முடிவு', 'Closing')} ${money(t.bal)}</small></h2>
      <table class="pr-t"><thead><tr><th>${T('தேதி', 'Date')}</th>${C.note ? `<th>${T('விவரம்', 'Details')}</th>` : ''}${cols.map(c => `<th class="r">${c[1]}</th>`).join('')}</tr></thead><tbody>
      ${t.rows.map(({ e, bal }) => `<tr><td>${dmy(e.date)}${e.time && e.time !== '00:00' ? ' <small>' + niceTime(e.time) + '</small>' : ''}</td>${C.note ? `<td>${isSettle(e) ? esc(e.note || '') + ' <small>(' + L.settled + ')</small>' : esc([e.note, e.party, e.cat].filter(Boolean).join(' · ') || '—') + (!counts(e) ? ' <small>(' + (e.pending ? T('நிலுவை', 'pending') : T('இருப்பில் இல்லை', 'not in balance')) + ')</small>' : '')}</td>` : ''}${cols.map(c => `<td class="r ${c[3]}">${c[2](e, bal)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="8">${T('பதிவு இல்லை', 'No entries')}</td></tr>`}
      <tr class="pr-total"><td>${C.note ? '' : `<b>${T('மொத்தம்', 'Total')}</b>`}</td>${C.note ? `<td><b>${T('மொத்தம்', 'Total')}</b></td>` : ''}${cols.map(c => `<td class="r ${c[3]}"><b>${money(c[4])}</b></td>`).join('')}</tr></tbody></table>`;
      html += endBoxes(t, T('மொத்தம்', 'Total') + ' · ' + a.name);
    }
  }
  html += `<p class="pr-f">Team Ledger ${VERSION}</p>`;
  const root = $('#print-root');
  root.innerHTML = `<div class="pr-page">${html}</div>`;
  fitToA4(root.firstChild);
  const ascii = String(title).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const fname = ('Team-Ledger-' + (ascii || 'Statement')).slice(0, 70) + '-' + today();
  if (ctx.preview) { toast(T('PDF Android ஆப்பில் மட்டும். Excel பயன்படுத்தலாம்.', 'PDF works in the Android app. Use Excel here.')); return; }
  setTimeout(() => { if (!native.print(fname)) { const old = document.title; document.title = fname; window.print(); setTimeout(() => { document.title = old; }, 1000); } }, 80);
}
/* Measure the printed page off-screen and shrink it so it fits on one A4 sheet (190 × 277 mm printable). */
export function fitToA4(page) {
  page.style.zoom = '';
  const probe = document.createElement('div'); probe.className = 'pr-measure'; probe.appendChild(page.cloneNode(true)); document.body.appendChild(probe);
  const el = probe.firstChild, mm = el.offsetWidth / 190, h = el.scrollHeight; probe.remove();
  const z = Math.min(1, (272 * mm) / Math.max(1, h));
  if (z < 1) page.style.zoom = Math.max(0.5, z).toFixed(3);
  return z;
}
export function csvReport(book, accIds, from, to) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Account', 'Date', 'Time', 'In', 'Out', 'Profit', 'Commission payable', 'Net profit', 'Taken from profit', 'Balance', 'Note', 'From/To', 'Type', 'Counted'].map(q).join(',')];
  for (const a of book.accounts.filter(a => !accIds || accIds.includes(a.id))) {
    const t = accountTotals(book, a, from, to);
    rows.push([a.name, from || '', '', '', '', '', '', '', '', (t.open / 100).toFixed(2), 'Opening balance', '', '', ''].map(q).join(','));
    const r2 = v => v ? (v / 100).toFixed(2) : '';
    for (const { e, bal } of t.rows) {
      if (isSettle(e)) { rows.push([a.name, e.date, e.time, '', '', '', '', '', r2(e.amt), (bal / 100).toFixed(2), e.note, '', 'Taken from profit', 'no'].map(q).join(',')); continue; }
      rows.push([a.name, e.date, e.time, e.dir > 0 ? r2(e.amt) : '', e.dir < 0 ? r2(e.amt) : '', r2((e.profit || 0) + (e.comm || 0)), r2(e.comm), r2(e.profit), '', (bal / 100).toFixed(2), e.note, e.party, e.cat, counts(e) ? 'yes' : 'no'].map(q).join(','));
    }
    if (t.gross || t.settled) rows.push([a.name, 'TOTAL', '', r2(t.inn), r2(t.out), r2(t.gross), r2(t.comm), r2(t.profit), r2(t.settled), (t.bal / 100).toFixed(2), 'Profit in hand ' + (t.inHand / 100).toFixed(2), '', '', ''].map(q).join(','));
  }
  saveFile('Team-Ledger-' + (book.kind === 'group' ? 'Group-' : '') + today() + '.csv', '﻿' + rows.join('\r\n'), 'text/csv');
}

/* Shared action handlers for ledger screens. */
export const ledgerActions = {
  'new-entry': (ctx, b) => { const book = ctx.book(); if (!book.canEdit) return toast(T('பார்க்க மட்டும் அனுமதி', 'View-only access')); entrySheet(ctx, book, { dir: Number(b.dataset.dir), acc: b.dataset.acc || '' }); },
  'edit-entry': (ctx, b) => { const book = ctx.book(), e = book.entries.find(x => x.id === b.dataset.id); if (e && isSettle(e)) { if (!book.canEdit) return toast(T('பார்க்க மட்டும் அனுமதி', 'View-only access')); return settleSheet(ctx, book, book.account(e.acc), e); } entrySheet(ctx, book, { id: b.dataset.id }); },
  'settle-new': (ctx, b) => { const book = ctx.book(); settleSheet(ctx, book, book.account(b.dataset.acc)); },
  'new-account': ctx => accountSheet(ctx, ctx.book(), null),
  'acc-menu': (ctx, b) => accountMenu(ctx, ctx.book(), ctx.book().account(b.dataset.id)),
  'acc-edit': (ctx, b) => accountSheet(ctx, ctx.book(), ctx.book().account(b.dataset.id)),
  'acc-pdf': (ctx, b) => { closeSheet(true); const [f, t] = periodRange(ctx.ui.period, ctx.ui.custom); const book = ctx.book(); pdfOptions(ctx, book, [b.dataset.id], f, t, book.account(b.dataset.id).name); },
  'acc-import': (ctx, b) => { closeSheet(true); const book = ctx.book(); importSheet(ctx, book, book.account(b.dataset.id)); },
  'acc-unimport': async (ctx, b) => {
    closeSheet(true); const book = ctx.book(), last = lastImport(book, b.dataset.id); if (!last) return;
    if (!(await confirmBox(T('கடைசியாக இறக்கியதை நீக்கவா?', 'Remove the last import?'), TP('{f} கோப்பிலிருந்து வந்த {n} பதிவுகள் நீக்கப்படும்.', '{n} entries from {f} will be removed.', { n: last.ids.length, f: last.name || '—' }), T('நீக்கு', 'Remove'), true))) return;
    await book.deleteEntries(last.ids); ctx.render(); toast(T('நீக்கப்பட்டது', 'Removed'));
  },
  'home-io': (ctx, b) => { ls.set('tl4-home-io', b.dataset.v); ctx.render(); },
  'rper-pick': ctx => periodPicker(ctx),
  'acc-share': (ctx, b) => { closeSheet(true); const book = ctx.book(); shareText(accountShareText(book, book.account(b.dataset.id))); },
  'search': ctx => { ctx.ui.searchOpen = true; ctx.ui.focusSearch = true; ctx.render(); },
  'search-close': ctx => { ctx.ui.searchOpen = false; ctx.ui.q = ''; ctx.render(); },
  'period': (ctx, b) => { if (b.dataset.for === 'acc') ctx.ui.period = b.dataset.k; else ctx.ui.rPeriod = b.dataset.k; ctx.render(); },
  'racc-pick': ctx => accPicker(ctx, ctx.book()),
  'pdf': ctx => { const book = ctx.book(); const [f, t] = periodRange(ctx.ui.rPeriod, ctx.ui.rCustom); const ids = repIds(ctx, book); pdfOptions(ctx, book, ids, f, t, ids ? ids.slice(0, 4).map(id => book.account(id).name).join(', ') + (ids.length > 4 ? ' +' + (ids.length - 4) : '') : (book.kind === 'group' ? book.name : T('எல்லா கணக்குகள்', 'All accounts'))); },
  'csv': ctx => { const book = ctx.book(); const [f, t] = periodRange(ctx.ui.rPeriod, ctx.ui.rCustom); const ids = repIds(ctx, book); csvReport(book, ids, f, t); }
};
