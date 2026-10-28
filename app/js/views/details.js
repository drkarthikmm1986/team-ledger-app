/* Account Details: bank accounts, UPI, contacts, IDs, cards and documents — encrypted. */
import { $, esc, T, ic, avatar, uid, native } from '../core/util.js';
import { FIELDS, REPEATS, SECRET_KEYS, blankRecord, repeatRows, unlock, seal, newSession, sessionFrom, rememberKey, forgetKey, rememberedUnlock, recordText, validateEnvelope } from '../core/vault.js';
import { toast, openSheet, closeSheet, confirmBox, formSheet, pickFiles, copyText, shareText, openFileData, sheetState } from '../ui/kit.js';
import { accRoute, safeId } from './ledger.js';

const sessions = new Map(); // bookId -> { session, records, envelope }
const L = (ta, en) => T(ta, en);
const reveal = new Set();
export const lockAll = () => { sessions.clear(); reveal.clear(); };
export const vaultSession = book => sessions.get(book.id);
const last4 = v => v ? '•••• ' + String(v).replace(/\s/g, '').slice(-4) : '';
const fmtCard = v => String(v || '').replace(/\D/g, '').slice(0, 19).replace(/(.{4})(?=.)/g, '$1 ');

async function persist(ctx, book, s) {
  const env = await seal(s.records, s.session, s.envelope);
  await book.setVault(env); s.envelope = env;
}

/* ---------- screens ---------- */
export function viewDetails(ctx, book, recordId) {
  const base = book.prefix + 'details';
  const back = book.kind === 'group' ? `<button class="icon-btn" data-go="${book.prefix}team" aria-label="back">${ic('back')}</button>` : `<span class="logo violet">${ic('card', 22).replace('currentColor', '#fff')}</span>`;
  const head = sub => `<div class="topbar">${back}<h1>${T('கணக்கு விவரங்கள்', 'Account Details')}<span class="sub line-violet">${sub || (book.kind === 'group' ? esc(book.name) : T('வங்கி · UPI · தொடர்பு · அட்டை · ஆவணம்', 'Bank · UPI · Contacts · Cards · Documents'))}</span></h1>`;
  const env = book.vault, s = sessions.get(book.id);
  if (!env) {
    if (!book.canEdit) return head() + `</div><div class="empty card"><p>${T('இந்தக் குழுவில் கணக்கு விவரங்கள் இல்லை.', 'This group has no account details.')}</p></div>`;
    return head() + `</div>
      <section class="hero hero-violet"><div class="label">${ic('shield', 18)} ${T('பாதுகாப்பான பெட்டி', 'Secure vault')}</div><div class="big sm">${T('வங்கி, UPI, ATM அட்டை, PAN, ஆதார் — எல்லாம் ஒரே இடத்தில்', 'Bank, UPI, ATM cards, PAN, Aadhaar — all in one place')}</div>
      <p class="hero-p">${T('எல்லாம் AES-256 பூட்டுடன் இந்த போனில் மட்டும் சேமிக்கப்படும்.', 'Everything is locked with AES-256 and kept on this device.')}</p></section>
      <div class="section-h"><h2>${T('எப்படி பூட்டலாம்?', 'How should it lock?')}</h2></div>
      <div class="menu">
        <button class="row" data-act="vault-create" data-mode="password"><span class="ic violet">${ic('lock')}</span><span class="tx"><b>${T('கடவுச்சொல்லுடன் (பரிந்துரை)', 'With a password (recommended)')}</b><small>${T('திறக்க கடவுச்சொல் தேவை. மறந்தால் திறக்க முடியாது.', 'Needs a password to open. If forgotten it cannot be opened.')}</small></span><span class="end">${ic('chev', 18)}</span></button>
        <button class="row" data-act="vault-create" data-mode="open"><span class="ic">${ic('unlock')}</span><span class="tx"><b>${T('கடவுச்சொல் இல்லாமல்', 'Without a password')}</b><small>${T('எளிது. ஆப் பூட்டு (PIN) போட்டுக்கொள்ளுங்கள்.', 'Simple. Turn on the app lock (PIN) for safety.')}</small></span><span class="end">${ic('chev', 18)}</span></button>
      </div>`;
  }
  if (!s) {
    let mode = '';
    try { validateEnvelope(env); mode = env.accessMode === 'open' ? 'open' : 'password'; } catch (e) { mode = 'bad'; }
    if (mode !== 'bad') setTimeout(() => autoUnlock(ctx, book), 0);
    return head() + `</div><div class="empty card"><div class="art violet-soft">${ic('lock', 52, 1.8)}</div>
      <h3>${T('பூட்டப்பட்டுள்ளது', 'Locked')}</h3>
      ${mode === 'bad' ? `<p>${T('இந்த விவரங்களைப் படிக்க முடியவில்லை.', 'These details could not be read.')}</p>` : mode === 'open' ? `<p>${T('திறக்கிறது…', 'Opening…')}</p>` : `
      <p>${T('கணக்கு விவரங்கள் கடவுச்சொல்லை அடிக்கவும்', 'Enter your Account Details password')}</p>
      <form id="vault-unlock" class="stack"><input class="input" id="vpass" type="password" autocomplete="current-password" placeholder="${T('கடவுச்சொல்', 'Password')}">
      <label class="check-row"><input type="checkbox" id="vremember" checked> ${T('இந்த போனில் நினைவில் வை', 'Remember on this phone')}</label>
      <button class="btn block" type="submit">${ic('unlock', 20)}${T('திற', 'Open')}</button><p class="form-error" role="alert"></p></form>`}
    </div>`;
  }
  const q = (ctx.ui.dq || '').trim().toLowerCase();
  if (recordId) {
    const r = s.records.find(x => x.id === recordId);
    if (r) return head(esc(r.bank || '')) + `<button class="icon-btn" data-act="vault-menu" aria-label="${T('விருப்பங்கள்', 'Options')}">${ic('dots', 22, 3)}</button></div>` + recordView(ctx, book, r);
  }
  const list = s.records.filter(r => !q || [r.name, r.holder, r.bank, r.number, r.ifsc, ...REPEATS.flatMap(([k]) => repeatRows(r, k).map(x => x.value + ' ' + x.label))].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  return head() + `<button class="icon-btn" data-act="vault-menu" aria-label="${T('விருப்பங்கள்', 'Options')}">${ic('dots', 22, 3)}</button></div>
    ${s.records.length > 3 ? `<label class="search mt0">${ic('search', 20)}<input id="dq" type="search" value="${esc(ctx.ui.dq || '')}" placeholder="${T('பெயர், வங்கி, எண், UPI தேடு', 'Search name, bank, number, UPI')}" autocomplete="off"></label>` : ''}
    <div class="section-h"><h2>${T('விவரங்கள்', 'Details')} <span class="muted">· ${s.records.length}</span></h2>${book.canEdit ? `<button class="link-btn violet-t" data-act="vault-new">${ic('plus', 18, 2.6)}${T('புதிது', 'New')}</button>` : ''}</div>
    <div class="list">${list.map(r => `<button class="acc" data-go="${base}-${safeId(r.id)}">${avatar(r.name)}<span class="meta"><span class="name">${esc(r.name)}</span><span class="when">${esc([r.bank, r.holder].filter(Boolean).join(' · ') || repeatRows(r, 'upiIds')[0]?.value || repeatRows(r, 'phones')[0]?.value || '')}</span></span><span class="bal mono">${esc(r.number ? last4(r.number) : r.cardNumber ? last4(r.cardNumber) : '')}</span></button>`).join('')
      || `<div class="empty card"><p>${s.records.length ? T('எதுவும் கிடைக்கவில்லை', 'Nothing found') : T('முதல் விவரத்தைச் சேர்க்க “புதிது” அழுத்துங்கள்.', 'Tap “New” to add the first detail.')}</p>${!s.records.length && book.canEdit ? `<button class="btn block violet-bg" data-act="vault-new">${ic('plus')}${T('விவரம் சேர்', 'Add details')}</button>` : ''}</div>`}</div>`;
}
function valueRow(k, label, value, secret) {
  if (!value) return '';
  const shown = !secret || reveal.has(k);
  return `<div class="kv"><span class="k">${esc(label)}</span><span class="v ${secret ? 'mono' : ''}">${shown ? esc(value) : '••••••'}</span>
    ${secret ? `<button class="mini" data-act="vault-reveal" data-k="${esc(k)}" aria-label="${T('காட்டு', 'Show')}">${ic(shown ? 'eyeoff' : 'eye', 18)}</button>` : ''}
    <button class="mini" data-act="vault-copy" data-v="${esc(value)}" aria-label="${T('நகலெடு', 'Copy')}">${ic('copy', 18)}</button></div>`;
}
function recordView(ctx, book, r) {
  const sec = (title, icon, rows) => rows.trim() ? `<div class="section-h"><h2>${ic(icon, 18)} ${title}</h2></div><div class="card kvs">${rows}</div>` : '';
  const bank = FIELDS.bank.filter(([k]) => k !== 'name').map(([k, ta, en]) => valueRow(k, L(ta, en), k === 'number' ? r[k] : r[k], k === 'number' && false)).join('');
  const contacts = REPEATS.map(([k, ta, en]) => repeatRows(r, k).map((row, i) => valueRow(k + i, (row.label ? row.label + ' · ' : '') + L(ta, en), row.value)).join('')).join('');
  const ids = FIELDS.ids.map(([k, ta, en]) => valueRow(k, L(ta, en), r[k], SECRET_KEYS.has(k))).join('');
  const secrets = FIELDS.secrets.map(([k, ta, en]) => valueRow(k, L(ta, en), k === 'cardNumber' ? fmtCard(r[k]) : r[k], true)).join('');
  const linked = r.ledgerAccountId && ctx.local.account(r.ledgerAccountId);
  return `<section class="hero hero-violet"><div class="hero-top"><span class="label">${esc(r.holder || T('கணக்கு', 'Account'))}</span>${r.type ? `<span class="hero-chip">${esc(r.type)}</span>` : ''}</div>
      <div class="big sm">${esc(r.name)}</div>
      ${r.number ? `<div class="hero-num mono">${esc(r.number)}</div>` : ''}<div class="hero-foot"><span>${esc(r.bank || '')}</span><span>${esc(r.ifsc || '')}</span></div></section>
    <div class="row2 mt12"><button class="btn ghost sm" data-act="vault-share" data-id="${esc(r.id)}">${ic('share', 18)}${T('பகிர் / நகல்', 'Share / copy')}</button>${book.canEdit ? `<button class="btn sm violet-bg" data-act="vault-edit" data-id="${esc(r.id)}">${ic('edit', 18)}${T('திருத்து', 'Edit')}</button>` : '<span></span>'}</div>
    ${sec(T('வங்கி', 'Bank'), 'bank', bank)}${sec(T('UPI & தொடர்பு', 'UPI & contacts'), 'phone', contacts)}${sec(T('அடையாளம் & குறிப்பு', 'IDs & notes'), 'id', ids)}${sec(T('அட்டை & கடவுச்சொல்', 'Card & passwords'), 'card', secrets)}
    ${r.files && r.files.length ? `<div class="section-h"><h2>${ic('image', 18)} ${T('ஆவணங்கள்', 'Documents')}</h2></div><div class="docs">${r.files.map((f, i) => `<button class="doc" data-act="vault-file" data-id="${esc(r.id)}" data-i="${i}">${f.type.startsWith('image/') ? `<img src="${f.data}" alt="${esc(f.name)}">` : `<span class="doc-pdf">${ic('pdf', 34)}</span>`}<span>${esc(f.label || f.name)}</span></button>`).join('')}</div>` : ''}
    ${linked ? `<button class="row card rounded mt14" data-go="${accRoute(ctx.local, linked.id)}"><span class="ic">${ic('link')}</span><span class="tx"><b>${T('இணைக்கப்பட்ட கணக்கு', 'Linked ledger account')}</b><small>${esc(linked.name)}</small></span><span class="end">${ic('chev', 18)}</span></button>` : ''}`;
}

/* ---------- unlock / create ---------- */
async function autoUnlock(ctx, book) {
  const env = book.vault; if (!env || sessions.get(book.id)) return;
  try {
    let u = null;
    if (env.accessMode === 'open') u = await unlock(env, '');
    else u = await rememberedUnlock(env);
    if (u) { sessions.set(book.id, { session: sessionFrom(env, u), records: u.records, envelope: env }); ctx.render(); }
  } catch (e) { toast(T('திறக்க முடியவில்லை', 'Could not open')); }
}
export function bindDetailsForms(ctx, book) {
  const f = $('#vault-unlock'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    const pass = $('#vpass').value, err = f.querySelector('.form-error'), btn = f.querySelector('button');
    if (!pass) return; btn.disabled = true; err.textContent = T('திறக்கிறது…', 'Opening…');
    try {
      const env = book.vault, u = await unlock(env, pass);
      sessions.set(book.id, { session: sessionFrom(env, u), records: u.records, envelope: env });
      if ($('#vremember') && $('#vremember').checked) await rememberKey(env, u.key);
      ctx.render();
    } catch (x) { err.textContent = x.code === 'WRONG_PASS' ? T('கடவுச்சொல் தவறு', 'Wrong password') : x.message; btn.disabled = false; }
  };
}
async function createVault(ctx, book, mode) {
  if (mode === 'open') {
    const session = await newSession('open');
    const s = { session, records: [], envelope: null }; await persist(ctx, book, s); sessions.set(book.id, s); ctx.render();
    toast(T('தயார். ஆப் பூட்டு (PIN) இயக்கப் பரிந்துரைக்கிறோம்.', 'Ready. We recommend turning on the app lock.'));
    return;
  }
  formSheet(T('கடவுச்சொல் அமை', 'Set a password'), `
    <p class="note">${T('குறைந்தது 6 எழுத்துகள். இதை மறந்தால் விவரங்களைத் திறக்க முடியாது — எழுதி பத்திரமாக வைத்துக்கொள்ளுங்கள்.', 'At least 6 characters. If you forget it the details cannot be opened — write it down somewhere safe.')}</p>
    <div class="field"><label for="p1">${T('கடவுச்சொல்', 'Password')}</label><input class="input" id="p1" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="p2">${T('மீண்டும்', 'Again')}</label><input class="input" id="p2" type="password" autocomplete="new-password"></div>
    <label class="check-row mt10"><input type="checkbox" id="prem" checked> ${T('இந்த போனில் நினைவில் வை', 'Remember on this phone')}</label>`,
    T('உருவாக்கு', 'Create'), async () => {
      const p1 = $('#p1').value, p2 = $('#p2').value;
      if (p1.length < 6) throw Error(T('குறைந்தது 6 எழுத்துகள்', 'At least 6 characters'));
      if (p1 !== p2) throw Error(T('இரண்டும் பொருந்தவில்லை', 'Passwords do not match'));
      const session = await newSession('password', p1);
      const s = { session, records: [], envelope: null }; await persist(ctx, book, s); sessions.set(book.id, s);
      if ($('#prem').checked) await rememberKey(s.envelope, session.key);
      ctx.render(); toast(T('பாதுகாப்பான பெட்டி தயார் ✓', 'Secure vault ready ✓'));
    });
}

/* ---------- editor ---------- */
function recordEditor(ctx, book, existing) {
  const s = sessions.get(book.id);
  const r = existing ? structuredClone(existing) : blankRecord();
  for (const [k] of REPEATS) r[k] = repeatRows(r, k);
  ['upi', 'businessUpi', 'otherIdLabel', 'otherId', 'phone', 'email'].forEach(k => { r[k] = ''; });
  const input = (k, ta, en, type, extra) => `<div class="field"><label for="v-${k}">${esc(L(ta, en))}</label><input class="input ${SECRET_KEYS.has(k) ? 'mono' : ''}" id="v-${k}" data-k="${k}" type="${type || 'text'}" value="${esc(r[k] || '')}" maxlength="200" autocomplete="off" ${extra || ''}></div>`;
  const draw = () => `
    <div class="tabs-mini" role="tablist">${[['b', T('வங்கி', 'Bank')], ['c', T('UPI·தொடர்பு', 'UPI·Contact')], ['i', T('அடையாளம்', 'IDs')], ['s', T('அட்டை', 'Card')], ['d', T('ஆவணம்', 'Docs')]].map(([k, l]) => `<button type="button" class="${ed.tab === k ? 'on' : ''}" data-v="tab" data-k="${k}">${l}</button>`).join('')}</div>
    <div ${ed.tab === 'b' ? '' : 'hidden'}><div class="row2">${FIELDS.bank.map(([k, ta, en]) => input(k, k === 'name' ? ta + ' *' : ta, k === 'name' ? en + ' *' : en, 'text', k === 'number' ? 'inputmode="numeric"' : '')).join('')}</div>
      <div class="field"><label for="v-link">${T('இணைக்கும் லெட்ஜர் கணக்கு (விருப்பம்)', 'Linked ledger account (optional)')}</label><select class="input" id="v-link"><option value="">—</option>${ctx.local.accounts.map(a => `<option value="${esc(a.id)}" ${r.ledgerAccountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div></div>
    <div ${ed.tab === 'c' ? '' : 'hidden'}>${REPEATS.map(([k, ta, en]) => `<div class="rep"><div class="rep-h"><b>${esc(L(ta, en))}</b><button type="button" class="mini" data-v="rep-add" data-k="${k}" aria-label="add">${ic('plus', 18, 2.6)}</button></div>
      ${r[k].map((row, i) => `<div class="rep-row"><input class="input" data-rep="${k}" data-i="${i}" data-f="label" value="${esc(row.label)}" maxlength="80" placeholder="${k === 'phones' ? T('SIM / பெயர்', 'SIM / name') : T('பெயர்', 'Label')}"><input class="input" data-rep="${k}" data-i="${i}" data-f="value" value="${esc(row.value)}" maxlength="200" placeholder="${esc(L(ta, en))}" ${k === 'phones' ? 'inputmode="tel"' : k === 'emails' ? 'inputmode="email"' : ''}><button type="button" class="mini" data-v="rep-rm" data-k="${k}" data-i="${i}" aria-label="remove">${ic('x', 18)}</button></div>`).join('')}</div>`).join('')}</div>
    <div ${ed.tab === 'i' ? '' : 'hidden'}><div class="row2">${FIELDS.ids.filter(([k]) => k !== 'notes').map(([k, ta, en]) => input(k, ta, en)).join('')}</div>
      <div class="field"><label for="v-notes">${T('குறிப்பு', 'Notes')}</label><textarea class="input" id="v-notes" data-k="notes" maxlength="2000">${esc(r.notes || '')}</textarea></div></div>
    <div ${ed.tab === 's' ? '' : 'hidden'}><p class="note">${ic('shield', 14)} ${T('இவை மறைக்கப்பட்டு காட்டப்படும்.', 'These are shown hidden.')}</p><div class="row2">${FIELDS.secrets.map(([k, ta, en]) => input(k, ta, en, k === 'cardNumber' || k === 'cvv' || k === 'atmPin' ? 'text' : 'password', k === 'cardNumber' || k === 'cvv' || k === 'atmPin' ? 'inputmode="numeric"' : '')).join('')}</div></div>
    <div ${ed.tab === 'd' ? '' : 'hidden'}><p class="note">${T('அட்டையின் முன் / பின் படம், PAN, ஆதார், passbook — 5 வரை (JPG, PNG, PDF).', 'Card front / back, PAN, Aadhaar, passbook — up to 5 (JPG, PNG, PDF).')}</p>
      <div class="docs">${r.files.map((f, i) => `<div class="doc">${f.type.startsWith('image/') ? `<img src="${f.data}" alt="">` : `<span class="doc-pdf">${ic('pdf', 34)}</span>`}<input class="input sm" data-doc="${i}" value="${esc(f.label || f.name)}" maxlength="80"><button type="button" class="mini" data-v="doc-rm" data-i="${i}">${ic('x', 16)}</button></div>`).join('')}
      ${r.files.length < 5 ? `<button type="button" class="doc add" data-v="doc-add">${ic('plus', 28)}<span>${T('சேர்', 'Add')}</span></button>` : ''}</div></div>`;
  const ed = { tab: 'b' };
  const sh = openSheet(existing ? T('விவரத்தைத் திருத்து', 'Edit details') : T('புதிய விவரம்', 'New details'), `<div id="ved">${draw()}</div>`,
    `${existing ? `<button class="btn danger" id="v-del">${ic('trash', 20)}</button>` : ''}<button class="btn violet-bg" id="v-save">${ic('check', 22, 3)}${T('சேமி', 'Save')}</button>`, { tall: true });
  const read = () => {
    sh.querySelectorAll('[data-k]').forEach(el => { if (el.id && el.id.startsWith('v-')) r[el.dataset.k] = el.value.trim(); });
    sh.querySelectorAll('[data-rep]').forEach(el => { const row = r[el.dataset.rep][Number(el.dataset.i)]; if (row) row[el.dataset.f] = el.value.trim(); });
    sh.querySelectorAll('[data-doc]').forEach(el => { const f = r.files[Number(el.dataset.doc)]; if (f) f.label = el.value.trim().slice(0, 80); });
    const link = $('#v-link'); if (link) r.ledgerAccountId = link.value || undefined;
  };
  const redraw = () => { read(); $('#ved').innerHTML = draw(); };
  sh.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-v]'); if (!b) return;
    if (b.dataset.v === 'tab') { read(); ed.tab = b.dataset.k; $('#ved').innerHTML = draw(); }
    else if (b.dataset.v === 'rep-add') { read(); if (r[b.dataset.k].length < 20) r[b.dataset.k].push({ label: '', value: '' }); $('#ved').innerHTML = draw(); const ins = sh.querySelectorAll(`[data-rep="${b.dataset.k}"][data-f="value"]`); ins.length && ins[ins.length - 1].focus(); }
    else if (b.dataset.v === 'rep-rm') { read(); r[b.dataset.k].splice(Number(b.dataset.i), 1); $('#ved').innerHTML = draw(); }
    else if (b.dataset.v === 'doc-rm') { read(); r.files.splice(Number(b.dataset.i), 1); $('#ved').innerHTML = draw(); }
    else if (b.dataset.v === 'doc-add') {
      read();
      const picked = await pickFiles('image/jpeg,image/png,application/pdf', true, 5 - r.files.length);
      for (const p of picked) { const type = ['image/jpeg', 'image/png', 'application/pdf'].includes(p.data.mime) ? p.data.mime : null; if (!type) { toast(T('JPG, PNG, PDF மட்டும்', 'JPG, PNG or PDF only')); continue; } r.files.push({ name: p.data.name.slice(0, 255), type, data: 'data:' + type + ';base64,' + p.data.data }); }
      $('#ved').innerHTML = draw();
    }
  });
  $('#v-save').onclick = async () => {
    read();
    if (!r.name) { ed.tab = 'b'; $('#ved').innerHTML = draw(); toast(T('கணக்கின் பெயர் தேவை', 'Account name is required')); $('#v-name') && $('#v-name').focus(); return; }
    for (const [k] of REPEATS) r[k] = r[k].filter(x => x.value);
    if (!r.ledgerAccountId) delete r.ledgerAccountId;
    const next = s.records.filter(x => x.id !== r.id).concat(r);
    $('#v-save').disabled = true;
    try { const prev = s.records; s.records = next; try { await persist(ctx, book, s); } catch (e) { s.records = prev; throw e; } closeSheet(); ctx.go(book.prefix + 'details-' + safeId(r.id)); toast(T('சேமிக்கப்பட்டது 🔒', 'Saved 🔒')); }
    catch (e) { toast(ctx.errorText(e)); $('#v-save').disabled = false; }
  };
  if (existing) $('#v-del').onclick = async () => {
    if (!await confirmBox(T('நீக்கவா?', 'Delete?'), `“${existing.name}”`, T('நீக்கு', 'Delete'), true)) return;
    const prev = s.records; s.records = s.records.filter(x => x.id !== existing.id);
    try { await persist(ctx, book, s); ctx.go(book.prefix + 'details'); toast(T('நீக்கப்பட்டது', 'Deleted')); } catch (e) { s.records = prev; toast(ctx.errorText(e)); }
  };
}
function shareSheet(ctx, book, r) {
  const keys = [...FIELDS.bank, ...REPEATS, ...FIELDS.ids, ...FIELDS.secrets].filter(([k]) => k === 'name' || (REPEATS.some(x => x[0] === k) ? repeatRows(r, k).length : r[k]));
  const def = new Set(['name', 'holder', 'bank', 'number', 'ifsc', 'branch', 'type', 'upiIds', 'businessUpiIds', 'phones']);
  openSheet(T('எதைப் பகிர்வது?', 'What to share?'), `<div class="checks">${keys.map(([k, ta, en]) => `<label class="check-row"><input type="checkbox" value="${k}" ${def.has(k) ? 'checked' : ''}> ${esc(L(ta, en))}${SECRET_KEYS.has(k) ? ` <span class="tag">${T('ரகசியம்', 'secret')}</span>` : ''}</label>`).join('')}</div>`,
    `<button class="btn ghost" id="sh-copy">${ic('copy', 20)}${T('நகல்', 'Copy')}</button><button class="btn violet-bg" id="sh-send">${ic('share', 20)}${T('அனுப்பு', 'Send')}</button>`);
  const text = () => recordText(r, [...document.querySelectorAll('.checks input:checked')].map(x => x.value), L);
  $('#sh-copy').onclick = () => { copyText(text()); closeSheet(); };
  $('#sh-send').onclick = () => { shareText(text()); closeSheet(); };
}
function vaultMenu(ctx, book) {
  const s = sessions.get(book.id), env = book.vault;
  openSheet(T('கணக்கு விவரங்கள்', 'Account Details'), `<div class="menu">
    <button class="row" data-act="vault-lock"><span class="ic violet">${ic('lock')}</span><span class="tx"><b>${T('இப்போது பூட்டு', 'Lock now')}</b></span></button>
    ${book.canEdit ? `<button class="row" data-act="vault-pass"><span class="ic">${ic('key')}</span><span class="tx"><b>${env.accessMode === 'open' ? T('கடவுச்சொல் போடு', 'Add a password') : T('கடவுச்சொல்லை மாற்று', 'Change password')}</b><small>${T('எல்லா விவரங்களும் புதிய பூட்டுடன் மீண்டும் சேமிக்கப்படும்', 'All details are re-locked with the new key')}</small></span></button>` : ''}
    ${env.accessMode !== 'open' ? `<button class="row" data-act="vault-forget"><span class="ic amber">${ic('x')}</span><span class="tx"><b>${T('இந்த போனில் மறந்துவிடு', 'Forget on this phone')}</b><small>${T('அடுத்த முறை கடவுச்சொல் கேட்கும்', 'Ask for the password next time')}</small></span></button>` : ''}
  </div><p class="note">${s ? s.records.length : 0} ${T('விவரங்கள்', 'records')} · AES-256-GCM · PBKDF2 600,000</p>`);
}
function changePass(ctx, book) {
  const s = sessions.get(book.id);
  formSheet(T('புதிய கடவுச்சொல்', 'New password'), `
    <div class="field"><label for="p1">${T('புதிய கடவுச்சொல் (6+)', 'New password (6+)')}</label><input class="input" id="p1" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="p2">${T('மீண்டும்', 'Again')}</label><input class="input" id="p2" type="password" autocomplete="new-password"></div>`,
    T('மாற்று', 'Change'), async () => {
      const p1 = $('#p1').value; if (p1.length < 6) throw Error(T('குறைந்தது 6 எழுத்துகள்', 'At least 6 characters')); if (p1 !== $('#p2').value) throw Error(T('இரண்டும் பொருந்தவில்லை', 'Passwords do not match'));
      const old = s.envelope; s.session = await newSession('password', p1); await persist(ctx, book, s);
      await forgetKey(old); await rememberKey(s.envelope, s.session.key); ctx.render(); toast(T('கடவுச்சொல் மாற்றப்பட்டது ✓', 'Password changed ✓'));
    });
}

export const detailsActions = {
  'vault-create': (ctx, b) => createVault(ctx, ctx.book(), b.dataset.mode),
  'vault-new': ctx => recordEditor(ctx, ctx.book(), null),
  'vault-edit': (ctx, b) => recordEditor(ctx, ctx.book(), sessions.get(ctx.book().id).records.find(r => r.id === b.dataset.id)),
  'vault-share': (ctx, b) => shareSheet(ctx, ctx.book(), sessions.get(ctx.book().id).records.find(r => r.id === b.dataset.id)),
  'vault-copy': (ctx, b) => copyText(b.dataset.v),
  'vault-reveal': (ctx, b) => { reveal.has(b.dataset.k) ? reveal.delete(b.dataset.k) : reveal.add(b.dataset.k); ctx.render(); },
  'vault-file': (ctx, b) => { const r = sessions.get(ctx.book().id).records.find(x => x.id === b.dataset.id), f = r.files[Number(b.dataset.i)]; openFileData({ id: r.id.slice(0, 20) + b.dataset.i, name: f.name }, { name: f.name, mime: f.type, data: f.data.split(',')[1] }); },
  'vault-menu': ctx => vaultMenu(ctx, ctx.book()),
  'vault-lock': ctx => { closeSheet(true); sessions.delete(ctx.book().id); reveal.clear(); ctx.go(ctx.book().prefix + 'details'); },
  'vault-pass': ctx => { closeSheet(true); changePass(ctx, ctx.book()); },
  'vault-forget': async ctx => { await forgetKey(ctx.book().vault); closeSheet(); toast(T('மறக்கப்பட்டது', 'Forgotten')); }
};
