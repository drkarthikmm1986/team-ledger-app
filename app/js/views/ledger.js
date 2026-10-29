/* Ledger screens shared by the personal book and group books: home, account, report, entry form. */
import { $, esc, T, TP, ic, LOGO, money, moneyAbs, nf, today, nowTime, addDays, niceDate, niceTime, dmy, periodRange, PERIODS, avatar, uid, ls, pctToBp, toPaise, VERSION, monName, ymd } from '../core/util.js';
import { counts, sortEntries, accountTotals, allTotals, calcProfit, exprToPaise, suggestNotes } from '../core/ledger.js';
import { toast, openSheet, closeSheet, confirmBox, sheetState, pickFiles, openFileData, saveFile, shareText } from '../ui/kit.js';
import { native } from '../core/util.js';

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
  const nb = !counts(e);
  const CAT = { 'Money in': T('வரவு', 'Money in'), 'Money out': T('செலவு', 'Money out'), 'Money given': T('கொடுத்தது', 'Money given'), 'Return': T('திரும்ப வந்தது', 'Return'), 'Deposit': T('வைப்பு', 'Deposit'), 'Withdrawal': T('எடுத்தது', 'Withdrawal'), 'Hold': T('நிலுவை', 'Hold'), 'Hold / To receive': T('நிலுவை', 'Hold'), 'Settled': T('தீர்வு', 'Settled'), 'Profit': T('லாபம்', 'Profit'), 'Commission paid': T('கமிஷன் செலுத்தியது', 'Commission paid') };
  const catName = c => CAT[c] || c;
  const title = e.note || catName(e.cat) || e.party || (e.dir > 0 ? T('வரவு', 'Money in') : T('செலவு', 'Money out'));
  const sub = [showAcc && acc ? acc.name : niceDate(e.date), niceTime(e.time), e.party && e.party !== title ? e.party : '', e.files && e.files.length ? '📎' + e.files.length : ''].filter(Boolean).join(' · ');
  const tag = e.pending ? `<span class="tag">${T('நிலுவை', 'Pending')}</span>` : e.noBal ? `<span class="tag">${esc(catName(e.cat) || T('தகவல்', 'Info'))}</span>` : '';
  return `<button class="entry" data-act="edit-entry" data-id="${esc(e.id)}">
    <span class="arrow ${nb ? 'nb' : e.dir > 0 ? 'in' : 'out'}">${ic(e.dir > 0 ? 'down' : 'up', 20, 2.6)}</span>
    <span class="meta"><span class="t1">${esc(title)}${tag}</span><span class="t2">${esc(sub)}</span></span>
    <span class="amt num ${nb ? 'muted' : e.dir > 0 ? 'in' : 'out'}">${e.dir > 0 ? '+' : '−'}${moneyAbs(e.amt)}${bal != null ? `<small>${T('இருப்பு', 'Bal')} ${money(bal)}</small>` : (e.profit ? `<small>${T('லாபம்', 'Profit')} ${money(e.profit)}</small>` : '')}</span>
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
  const t = today(), all = allTotals(book, '', ''), day = allTotals(book, t, t);
  const group = book.kind === 'group';
  const top = group
    ? `<div class="topbar"><button class="icon-btn" data-go="online" aria-label="${T('பின்', 'Back')}">${ic('back')}</button><h1>${esc(book.name)}<span class="sub line-blue">${ic('users', 14)} ${T('குழுக் கணக்கு', 'Group book')} · ${esc(roleName(book.role))}</span></h1>
       <button class="icon-btn" data-act="group-refresh" aria-label="${T('புதுப்பி', 'Refresh')}">${ic('refresh')}</button><button class="icon-btn" data-go="${book.prefix}team" aria-label="${T('குழு', 'Team')}">${ic('users')}</button></div>`
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
  let accs = book.accounts.filter(a => !a.archived).map(a => ({ a, t: accountTotals(book, a, '', '') }));
  accs.sort((x, y) => (y.t.last || '').localeCompare(x.t.last || '') || x.a.name.localeCompare(y.a.name));
  let found = [];
  if (q) {
    accs = accs.filter(x => x.a.name.toLowerCase().includes(q) || (x.a.phone || '').includes(q));
    found = sortEntries(book.entries.filter(e => (e.note || '').toLowerCase().includes(q) || (e.party || '').toLowerCase().includes(q) || (e.cat || '').toLowerCase().includes(q) || String(e.amt / 100).startsWith(q))).reverse().slice(0, 40);
  }
  const backupDue = !group && book.entries.length >= 5 && (Date.now() - Number(ls.get('tl4-last-backup', '0'))) > 7 * 864e5;
  return top + (ctx.preview && !group ? previewNote() : '') + `
    <section class="hero ${group ? 'hero-blue' : ''}">
      <div class="hero-top"><span class="label">${T('மொத்த இருப்பு', 'Total balance')}</span><button class="hero-link" data-go="${book.prefix}report">${ic('chart', 16)}${T('அறிக்கை', 'Report')}</button></div>
      <div class="big num">${money(all.bal)}</div>
      <div class="pills">
        <div class="pill"><small><i class="dot in"></i>${T('இன்று வரவு', 'In today')}</small><b class="num">${money(day.inn)}</b></div>
        <div class="pill"><small><i class="dot out"></i>${T('இன்று செலவு', 'Out today')}</small><b class="num">${money(day.out)}</b></div>
      </div>
    </section>
    ${backupDue ? `<button class="row card mt12 rounded" data-act="backup"><span class="ic amber">${ic('bell')}</span><span class="tx"><b>${T('Backup எடுக்கும் நேரம்', 'Time for a backup')}</b><small>${T('போன் தொலைந்தாலும் கணக்கு பாதுகாப்பாக இருக்கும்', 'Keeps your records safe if the phone is lost')}</small></span><span class="end">${ic('save', 20)}</span></button>` : ''}
    ${ctx.ui.searchOpen || q ? `<label class="search">${ic('search', 20)}<input id="q" type="search" value="${esc(ctx.ui.q)}" placeholder="${T('பெயர், குறிப்பு, தொகை தேடு', 'Search name, note, amount')}" autocomplete="off"><button data-act="search-close" aria-label="close">${ic('x', 20)}</button></label>` : ''}
    <div class="section-h"><h2>${T('கணக்குகள்', 'Accounts')} <span class="muted">· ${accs.length}</span></h2>
      ${book.canEdit ? `<button class="link-btn" data-act="new-account">${ic('plus', 18, 2.6)}${T('புதிது', 'New')}</button>` : ''}</div>
    <div class="list">${accs.map(({ a, t }) => `
      <button class="acc" data-go="${accRoute(book, a.id)}">${avatar(a.name)}
        <span class="meta"><span class="name">${esc(a.name)}</span><span class="when">${t.last ? niceDate(t.last) : T('பதிவு இல்லை', 'No entries')}</span></span>
        <span class="bal num ${t.bal < 0 ? 'out' : t.bal > 0 ? 'in' : ''}">${money(t.bal)}<small>${T('இருப்பு', 'Balance')}</small></span>
      </button>`).join('') || `<p class="muted center">${T('எதுவும் கிடைக்கவில்லை', 'Nothing found')}</p>`}</div>
    ${found.length ? `<div class="section-h"><h2>${T('பதிவுகள்', 'Entries')}</h2></div><div class="entries">${found.map(e => entryRow(book, e, null, true)).join('')}</div>` : ''}`;
}
const previewNote = () => `<div class="row card mb12 rounded"><span class="ic amber">${ic('info')}</span><span class="tx"><b>${T('இணைய link பதிப்பு', 'Web link version')}</b><small>${T('இங்கே தனிக் கணக்கு, கணக்கு விவரங்கள் வேலை செய்யும். குழுக் கணக்கு (Online), PDF — Android ஆப்பில் (மேலும் → APK).', 'Personal book and Account Details work here. Online groups and PDF work in the Android app (More → APK).')}</small></span></div>`;
export const roleName = r => ({ admin: T('நிர்வாகி', 'Admin'), editor: T('திருத்துபவர்', 'Editor'), commenter: T('கருத்திடுபவர்', 'Commenter'), viewer: T('பார்வையாளர்', 'Viewer') }[r] || r || '');

/* ---------------- Account ---------------- */
export function viewAccount(ctx, book, a) {
  const [from, to] = periodRange(ctx.ui.period, ctx.ui.custom);
  const t = accountTotals(book, a, from, to);
  const groups = new Map();
  t.rows.slice().reverse().forEach(r => { if (!groups.has(r.e.date)) groups.set(r.e.date, []); groups.get(r.e.date).push(r); });
  const hasProfit = t.profit || t.comm || a.rate;
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
      ${(t.open || hasProfit) ? `<div class="hero-foot"><span>${T('தொடக்க இருப்பு', 'Opening')} ${money(t.open)}</span>${hasProfit ? `<span>${T('லாபம்', 'Profit')} ${money(t.profit)}</span>` : ''}</div>` : ''}
    </section>
    ${periodChips(ctx.ui.period, 'acc')}${ctx.ui.period === 'custom' ? customDates(ctx.ui.custom, 'acc') : ''}
    ${t.rows.length ? [...groups].map(([d, rows]) => {
      const di = rows.reduce((n, r) => n + (counts(r.e) && r.e.dir > 0 ? r.e.amt : 0), 0), dout = rows.reduce((n, r) => n + (counts(r.e) && r.e.dir < 0 ? r.e.amt : 0), 0);
      return `<div class="day-h"><span>${niceDate(d)}</span><span class="num">${di ? `<span class="in">+${moneyAbs(di)}</span> ` : ''}${dout ? `<span class="out">−${moneyAbs(dout)}</span>` : ''}</span></div>
      <div class="entries">${rows.map(r => entryRow(book, r.e, r.bal)).join('')}</div>`;
    }).join('') : `<div class="empty"><p>${T('இந்த காலத்தில் பதிவு இல்லை. கீழே பச்சை அல்லது சிவப்பு பட்டனை அழுத்துங்கள்.', 'No entries in this period. Tap green or red below.')}</p></div>`}`;
}

/* ---------------- Report ---------------- */
export function viewReport(ctx, book) {
  const [from, to] = periodRange(ctx.ui.rPeriod, ctx.ui.rCustom);
  const ids = ctx.ui.rAcc && book.account(ctx.ui.rAcc) ? [ctx.ui.rAcc] : null;
  const tot = allTotals(book, from, to, ids);
  const accs = book.accounts.filter(a => !ids || ids.includes(a.id)).map(a => ({ a, t: accountTotals(book, a, from, to) }));
  const rangeTxt = from || to ? `${niceDate(from) || '…'} – ${niceDate(to) || '…'}` : T('எல்லா நாட்களும்', 'All time');
  const group = book.kind === 'group';
  return `<div class="topbar">${group ? `<button class="icon-btn" data-go="${book.prefix.replace(/-$/, '')}" aria-label="back">${ic('back')}</button>` : `<span class="logo">${ic('chart', 22).replace('currentColor', '#fff')}</span>`}<h1>${T('அறிக்கை', 'Report')}<span class="sub">${group ? esc(book.name) + ' · ' : ''}${esc(rangeTxt)}</span></h1></div>
    ${periodChips(ctx.ui.rPeriod, 'rep')}${ctx.ui.rPeriod === 'custom' ? customDates(ctx.ui.rCustom, 'rep') : ''}
    <div class="chips mt4"><button class="chip ${!ids ? 'on' : ''}" data-act="racc" data-id="">${T('எல்லா கணக்கும்', 'All accounts')}</button>${book.accounts.map(a => `<button class="chip ${ids && ids[0] === a.id ? 'on' : ''}" data-act="racc" data-id="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>
    <div class="stats">
      <div class="stat"><small><i class="dot in"></i>${T('வரவு', 'Money in')}</small><b class="num in">${money(tot.inn)}</b></div>
      <div class="stat"><small><i class="dot out"></i>${T('செலவு', 'Money out')}</small><b class="num out">${money(tot.out)}</b></div>
      <div class="stat"><small>${T('வித்தியாசம் (வரவு − செலவு)', 'Difference (in − out)')}</small><b class="num ${tot.inn - tot.out < 0 ? 'out' : 'in'}">${money(tot.inn - tot.out)}</b></div>
      <div class="stat"><small>${T('முடிவு இருப்பு', 'Closing balance')}</small><b class="num">${money(tot.bal)}</b></div>
      ${tot.profit || tot.comm ? `<div class="stat wide"><small>${T('லாபம்', 'Profit')}${tot.comm ? ' · ' + T('கமிஷன் கழித்து', 'after commission') + ' ' + money(tot.comm) : ''}</small><b class="num in">${money(tot.profit)}</b></div>` : ''}
    </div>
    <div class="card chart">${chart(book, from, to, ids)}</div>
    <div class="row2 mt12"><button class="btn" data-act="pdf">${ic('pdf', 20)}PDF</button><button class="btn ghost" data-act="csv">${ic('excel', 20)}Excel</button></div>
    <div class="section-h"><h2>${T('கணக்கு வாரியாக', 'By account')}</h2></div>
    <div class="card clip"><table class="table num"><thead><tr><th>${T('கணக்கு', 'Account')}</th><th>${T('வரவு', 'In')}</th><th>${T('செலவு', 'Out')}</th><th>${T('இருப்பு', 'Bal')}</th></tr></thead><tbody>
      ${accs.map(({ a, t }) => `<tr class="click" data-go="${accRoute(book, a.id)}"><td>${esc(a.name)}</td><td class="in">${money(t.inn)}</td><td class="out">${money(t.out)}</td><td>${money(t.bal)}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${T('கணக்கு இல்லை', 'No accounts')}</td></tr>`}
    </tbody></table></div>`;
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
    const rate = f.rate != null ? f.rate : acc ? acc.rate || 0 : 0;
    const commRate = f.commRate != null ? f.commRate : acc ? acc.commRate || 0 : 0;
    const pr = calcProfit(acc, amt || 0, f.rate, f.commRate);
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
      ${(rate || commRate) && amt && !edit?.imported ? `<div class="calc-preview">${T('லாபம்', 'Profit')}: ${money(pr.profit + pr.comm)}${pr.comm ? ` − ${T('கமிஷன்', 'commission')} ${money(pr.comm)} = ${money(pr.profit)}` : ''}</div>` : ''}
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
    const pct = (el, k) => { if (!el || el.value === el.dataset.init) return; const v = el.value.trim(); f[k] = v === '' ? (book.account(f.acc) && book.account(f.acc)[k === 'rate' ? 'rate' : 'commRate'] ? 0 : null) : pctToBp(v); el.dataset.init = el.value; };
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
      const changedMoney = !edit || edit.amt !== amt || (edit.rate ?? null) !== (f.rate ?? null) || (edit.commRate ?? null) !== (f.commRate ?? null) || edit.acc !== accId;
      const pr = changedMoney || !edit.imported ? calcProfit(acc, amt, f.rate, f.commRate) : { profit: edit.profit, comm: edit.comm };
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
  a = a || { name: '', phone: '', opening: 0, rate: 0, commRate: 0, note: '' };
  const group = book.kind === 'group';
  const body = `
    <div class="field"><label for="a-name">${T('பெயர்', 'Name')} *</label><input class="input" id="a-name" maxlength="80" value="${esc(a.name)}" placeholder="${T('உதா: முருகன், கடை, வீட்டுச் செலவு', 'e.g. Murugan, Shop, Home')}"></div>
    ${group ? '' : `<div class="field"><label for="a-phone">${T('போன் (விருப்பம்)', 'Phone (optional)')}</label><input class="input" id="a-phone" type="tel" inputmode="tel" maxlength="20" value="${esc(a.phone || '')}"></div>`}
    <div class="field"><label for="a-open">${T('தொடக்க இருப்பு (விருப்பம்)', 'Opening balance (optional)')}</label>
      <div class="flex8"><span class="seg"><button type="button" id="a-sign-p" class="${a.opening >= 0 ? 'on' : ''}">+</button><button type="button" id="a-sign-m" class="${a.opening < 0 ? 'on' : ''}">−</button></span>
      <input class="input" id="a-open" type="number" inputmode="decimal" step="0.01" min="0" value="${a.opening ? Math.abs(a.opening) / 100 : ''}" placeholder="0"></div>
      <p class="note">${T('ஏற்கனவே இருக்கும் பணம் அல்லது பாக்கி. + = கையில் / வர வேண்டியது, − = கொடுக்க வேண்டியது.', 'Money you already have or owe. + = have / to receive, − = to pay.')}</p></div>
    <details class="mt14" ${a.rate || a.commRate ? 'open' : ''}><summary class="summary">${T('வியாபாரத்துக்கு: லாபம் / கமிஷன் %', 'For business: profit / commission %')}</summary>
      <div class="row2"><div class="field"><label for="a-rate">${T('லாபம் %', 'Profit %')}</label><input class="input" id="a-rate" type="number" inputmode="decimal" step="0.01" min="0" max="100" value="${a.rate ? a.rate / 100 : ''}" placeholder="0"></div>
      <div class="field"><label for="a-comm">${T('கமிஷன் %', 'Commission %')}</label><input class="input" id="a-comm" type="number" inputmode="decimal" step="0.01" min="0" max="100" value="${a.commRate ? a.commRate / 100 : ''}" placeholder="0"></div></div>
      <p class="note">${T('ஒவ்வொரு பதிவிலும் இந்த % படி லாபம் தானாகக் கணக்கிடப்படும்.', 'Profit is calculated automatically for every entry.')}</p></details>
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
    const rec = Object.assign({}, a, { name, phone: $('#a-phone') ? $('#a-phone').value.trim() : '', opening: Number.isSafeInteger(open) ? open : 0, rate: pctToBp($('#a-rate').value) || 0, commRate: pctToBp($('#a-comm').value) || 0 });
    if (!edit) { rec.id = uid(); rec.created = Date.now(); }
    $('#a-save').disabled = true;
    try { await book.putAccount(rec); closeSheet(); if (!edit) ctx.go(accRoute(book, rec.id)); else ctx.render(); toast(T('சேமிக்கப்பட்டது', 'Saved')); }
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
    <button class="row" data-act="acc-pdf" data-id="${esc(a.id)}"><span class="ic">${ic('pdf')}</span><span class="tx"><b>${T('PDF அறிக்கை', 'PDF statement')}</b></span></button>
    <button class="row" data-act="acc-share" data-id="${esc(a.id)}"><span class="ic green">${ic('share')}</span><span class="tx"><b>${T('இருப்பை அனுப்பு (WhatsApp)', 'Send balance (WhatsApp)')}</b></span></button>
    ${a.phone && !native.any ? `<a class="row link-row" href="tel:${esc(a.phone)}"><span class="ic">${ic('phone')}</span><span class="tx"><b>${T('அழை', 'Call')} ${esc(a.phone)}</b></span></a>` : ''}
  </div>`);
}
export function accountShareText(book, a) {
  const t = accountTotals(book, a, '', '');
  const last = t.rows.slice(-5).reverse();
  return `${a.name}\n${T('இருப்பு', 'Balance')}: ${money(t.bal)}\n${T('மொத்த வரவு', 'Total in')}: ${money(t.inn)} · ${T('மொத்த செலவு', 'Total out')}: ${money(t.out)}\n\n` +
    (last.length ? T('கடைசி பதிவுகள்:', 'Recent entries:') + '\n' + last.map(({ e }) => `${dmy(e.date).replace(/-/g, '/')}  ${e.dir > 0 ? '+' : '−'}${moneyAbs(e.amt)}  ${e.note || ''}`).join('\n') + '\n\n' : '') + '— Team Ledger';
}

/* ---------------- PDF & CSV ---------------- */
export function printReport(ctx, book, accIds, from, to, title) {
  const accs = book.accounts.filter(a => !accIds || accIds.includes(a.id));
  const tot = allTotals(book, from, to, accIds);
  const range = from || to ? `${dmy(from) || '…'} → ${dmy(to) || '…'}` : T('எல்லா நாட்களும்', 'All time');
  const anyProfit = accs.some(a => accountTotals(book, a, from, to).profit);
  let html = `<div class="pr-h"><div><h1>${esc(title)}</h1><p>${esc(range)}${book.kind === 'group' ? ' · ' + esc(book.name) : ''}</p></div><p>Team Ledger · ${new Date().toLocaleString('en-IN')}</p></div>
    <div class="pr-sum"><div><small>${T('வரவு', 'Money in')}</small><b class="pr-in">${money(tot.inn)}</b></div><div><small>${T('செலவு', 'Money out')}</small><b class="pr-out">${money(tot.out)}</b></div><div><small>${T('இருப்பு', 'Balance')}</small><b>${money(tot.bal)}</b></div>${anyProfit ? `<div><small>${T('லாபம்', 'Profit')}</small><b>${money(tot.profit)}</b></div>` : ''}</div>`;
  for (const a of accs) {
    const t = accountTotals(book, a, from, to);
    html += `<h2 class="pr-acc">${esc(a.name)} <small>· ${T('தொடக்கம்', 'Opening')} ${money(t.open)} · ${T('முடிவு', 'Closing')} ${money(t.bal)}</small></h2>
      <table class="pr-t"><thead><tr><th>${T('தேதி', 'Date')}</th><th>${T('விவரம்', 'Details')}</th><th class="r">${T('வரவு', 'In')}</th><th class="r">${T('செலவு', 'Out')}</th>${anyProfit ? `<th class="r">${T('லாபம்', 'Profit')}</th>` : ''}<th class="r">${T('இருப்பு', 'Balance')}</th></tr></thead><tbody>
      ${t.rows.map(({ e, bal }) => `<tr><td>${dmy(e.date)}${e.time && e.time !== '00:00' ? '<br><small>' + niceTime(e.time) + '</small>' : ''}</td><td>${esc([e.note, e.party, e.cat].filter(Boolean).join(' · ') || '—')}${!counts(e) ? ' <small>(' + (e.pending ? T('நிலுவை', 'pending') : T('இருப்பில் இல்லை', 'not in balance')) + ')</small>' : ''}</td>
        <td class="r pr-in">${e.dir > 0 ? money(e.amt) : ''}</td><td class="r pr-out">${e.dir < 0 ? money(e.amt) : ''}</td>${anyProfit ? `<td class="r">${e.profit ? money(e.profit) : ''}</td>` : ''}<td class="r">${money(bal)}</td></tr>`).join('') || `<tr><td colspan="6">${T('பதிவு இல்லை', 'No entries')}</td></tr>`}
      <tr class="pr-total"><td></td><td><b>${T('மொத்தம்', 'Total')}</b></td><td class="r pr-in"><b>${money(t.inn)}</b></td><td class="r pr-out"><b>${money(t.out)}</b></td>${anyProfit ? `<td class="r"><b>${money(t.profit)}</b></td>` : ''}<td class="r"><b>${money(t.bal)}</b></td></tr></tbody></table>`;
  }
  html += `<p class="pr-f">Team Ledger ${VERSION}</p>`;
  $('#print-root').innerHTML = html;
  const ascii = String(title).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const fname = ('Team-Ledger-' + (ascii || 'Statement')).slice(0, 70) + '-' + today();
  if (ctx.preview) { toast(T('PDF Android ஆப்பில் மட்டும். Excel பயன்படுத்தலாம்.', 'PDF works in the Android app. Use Excel here.')); return; }
  setTimeout(() => { if (!native.print(fname)) { const old = document.title; document.title = fname; window.print(); setTimeout(() => { document.title = old; }, 1000); } }, 80);
}
export function csvReport(book, accIds, from, to) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Account', 'Date', 'Time', 'In', 'Out', 'Profit', 'Balance', 'Note', 'From/To', 'Type', 'Counted'].map(q).join(',')];
  for (const a of book.accounts.filter(a => !accIds || accIds.includes(a.id))) {
    const t = accountTotals(book, a, from, to);
    rows.push([a.name, from || '', '', '', '', '', (t.open / 100).toFixed(2), 'Opening balance', '', '', ''].map(q).join(','));
    for (const { e, bal } of t.rows) rows.push([a.name, e.date, e.time, e.dir > 0 ? (e.amt / 100).toFixed(2) : '', e.dir < 0 ? (e.amt / 100).toFixed(2) : '', e.profit ? (e.profit / 100).toFixed(2) : '', (bal / 100).toFixed(2), e.note, e.party, e.cat, counts(e) ? 'yes' : 'no'].map(q).join(','));
  }
  saveFile('Team-Ledger-' + (book.kind === 'group' ? 'Group-' : '') + today() + '.csv', '﻿' + rows.join('\r\n'), 'text/csv');
}

/* Shared action handlers for ledger screens. */
export const ledgerActions = {
  'new-entry': (ctx, b) => { const book = ctx.book(); if (!book.canEdit) return toast(T('பார்க்க மட்டும் அனுமதி', 'View-only access')); entrySheet(ctx, book, { dir: Number(b.dataset.dir), acc: b.dataset.acc || '' }); },
  'edit-entry': (ctx, b) => entrySheet(ctx, ctx.book(), { id: b.dataset.id }),
  'new-account': ctx => accountSheet(ctx, ctx.book(), null),
  'acc-menu': (ctx, b) => accountMenu(ctx, ctx.book(), ctx.book().account(b.dataset.id)),
  'acc-edit': (ctx, b) => accountSheet(ctx, ctx.book(), ctx.book().account(b.dataset.id)),
  'acc-pdf': (ctx, b) => { closeSheet(true); const [f, t] = periodRange(ctx.ui.period, ctx.ui.custom); const book = ctx.book(); printReport(ctx, book, [b.dataset.id], f, t, book.account(b.dataset.id).name); },
  'acc-share': (ctx, b) => { closeSheet(true); const book = ctx.book(); shareText(accountShareText(book, book.account(b.dataset.id))); },
  'search': ctx => { ctx.ui.searchOpen = true; ctx.ui.focusSearch = true; ctx.render(); },
  'search-close': ctx => { ctx.ui.searchOpen = false; ctx.ui.q = ''; ctx.render(); },
  'period': (ctx, b) => { if (b.dataset.for === 'acc') ctx.ui.period = b.dataset.k; else ctx.ui.rPeriod = b.dataset.k; ctx.render(); },
  'racc': (ctx, b) => { ctx.ui.rAcc = b.dataset.id; ctx.render(); },
  'pdf': ctx => { const book = ctx.book(); const [f, t] = periodRange(ctx.ui.rPeriod, ctx.ui.rCustom); const ids = ctx.ui.rAcc && book.account(ctx.ui.rAcc) ? [ctx.ui.rAcc] : null; printReport(ctx, book, ids, f, t, ids ? book.account(ids[0]).name : (book.kind === 'group' ? book.name : T('எல்லா கணக்குகள்', 'All accounts'))); },
  'csv': ctx => { const book = ctx.book(); const [f, t] = periodRange(ctx.ui.rPeriod, ctx.ui.rCustom); const ids = ctx.ui.rAcc && book.account(ctx.ui.rAcc) ? [ctx.ui.rAcc] : null; csvReport(book, ids, f, t); }
};
