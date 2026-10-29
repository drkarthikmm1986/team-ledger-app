/* Team Ledger Online: sign in, groups, invitations, members, recovery, comments. */
import { $, esc, T, TP, ic, avatar, CFG, ls, native, lang } from '../core/util.js';
import { createClient } from '../online/supa.js';
import { unlockDeviceVault } from '../online/device-vault.js';
import { Groups } from '../online/groups.js';
import { fingerprint } from '../online/invitations.js';
import { normalizePhone, normalizeContact, phoneError } from '../online/phone.js';
import { createGroupBook } from '../online/group-book.js';
import { toast, openSheet, closeSheet, confirmBox, formSheet, fieldHtml, copyText, toggleSecret } from '../ui/kit.js';
import { roleName } from './ledger.js';

export const online = { client: null, vault: null, groups: null, user: null, list: null, book: null, busy: false, lastActivity: Date.now(), team: null };
const REDIRECT = () => native.any ? 'teamledgergroup://auth' : (CFG.authRedirect || 'https://team-ledger-offline.drkarthikmm24.chatgpt.site/group/');
const client = () => online.client || (online.client = createClient(CFG.supabaseUrl, CFG.supabaseKey));
export const signedIn = () => !!(online.user && online.groups);

export function onlineError(e) {
  const m = (e && e.message) || '';
  const known = [
    [/invalid_credentials|Invalid login/i, 'மின்னஞ்சல் / மொபைல், கடவுச்சொல்லைச் சரிபாருங்கள்.', 'Check your email / mobile and password.'],
    [/email_not_confirmed|not confirmed/i, 'முதலில் மின்னஞ்சலில் வந்த உறுதிப்படுத்தலை முடிக்கவும்.', 'Open your verification email first, then sign in.'],
    [/Maximum 10|Group is full/i, 'அதிகபட்சம் 10 உறுப்பினர்கள்.', 'Maximum 10 members.'],
    [/Maximum three groups/i, 'அதிகபட்சம் 3 குழுக்கள்.', 'Maximum 3 groups.'],
    [/Admin required/i, 'நிர்வாகி அனுமதி தேவை.', 'Admin access required.'],
    [/Old group code|Invalid group code|Invalid invitation|Invite invalid/i, 'குறியீடு தவறு அல்லது காலாவதியானது. நிர்வாகியிடம் கேளுங்கள்.', 'This code is invalid or expired. Ask your admin.'],
    [/Enter the 8-character/i, '8 எழுத்துகளையும் உள்ளிடுங்கள்.', 'Enter all 8 characters.'],
    [/10-character/i, '10 எழுத்து மீட்புக் குறியீட்டை உள்ளிடுங்கள்.', 'Enter the 10-character recovery code.'],
    [/Too many|rate/i, 'பல முயற்சிகள். சிறிது நேரம் கழித்து முயற்சிக்கவும்.', 'Too many attempts. Please wait and try again.'],
    [/Group access removed/i, 'இந்தக் குழுவில் உங்கள் அனுமதி நீக்கப்பட்டுள்ளது.', 'Your access to this group was removed.'],
    [/Older server version/i, 'பழைய server பதிப்பு கண்டறியப்பட்டது. Refresh செய்யவும்.', 'Older server version detected. Refresh first.'],
    [/locked/, 'இது பழைய ஆப்பின் சிறப்புப் பதிவு. பழைய ஆப்பில் திருத்தவும்.', 'This is a special old-app record. Edit it in the old app.'],
    [/Group limit|storage limit|too large/i, 'குழுவின் சேமிப்பு வரம்பு நிறைந்தது. இணைப்புகளைக் குறைக்கவும்.', 'Group storage is full. Remove some attachments.'],
    [/Team name does not match/i, 'குழுப் பெயர் பொருந்தவில்லை.', 'Team name does not match.']
  ];
  const k = known.find(x => x[0].test(m) || x[0].test((e && e.code) || ''));
  if (k) return T(k[1], k[2]);
  if (e && (e.code === '40001' || e.name === 'ConflictError' || /changed this account|Refresh before/i.test(m))) return T('வேறொருவர் இப்போது மாற்றியுள்ளார். Refresh செய்து மீண்டும் முயற்சிக்கவும்.', 'Someone else just changed this group. Refresh and try again.');
  if (e && (e.code === 'KEY_REQUIRED' || /Group key required/.test(m))) return T('இந்த போனில் குழுச் சாவி இல்லை. மீட்புக் குறியீட்டை உள்ளிடுங்கள்.', 'This phone does not have the group key. Enter a recovery code.');
  if (e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202')) return T('Supabase-ல் ஒருமுறை setup SQL run செய்ய வேண்டும்.', 'One-time Supabase setup SQL is needed.');
  if (/fetch|network|abort|Failed|timeout|Load failed/i.test(m) || (e && e.name === 'TypeError')) return T('இணைய இணைப்பு இல்லை. மீண்டும் முயற்சிக்கவும்.', 'No connection. Check the internet and try again.');
  return (lang() === 'ta' && /[஀-௿]/.test(m)) ? m : T('செயலை முடிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.', 'Could not complete this. Please try again.') + (m && lang() === 'en' ? ' (' + m + ')' : '');
}

/* ---------------- screens ---------------- */
export function viewOnline(ctx) {
  const head = sub => `<div class="topbar"><span class="logo blue">${ic('users', 22).replace('currentColor', '#fff')}</span><h1>${T('குழுக் கணக்கு', 'Team Ledger Online')}<span class="sub line-blue">${sub}</span></h1>${signedIn() ? `<button class="icon-btn" data-act="ol-refresh" aria-label="refresh">${ic('refresh')}</button><button class="icon-btn" data-act="ol-signout" aria-label="${T('வெளியேறு', 'Sign out')}">${ic('logout')}</button>` : ''}</div>`;
  if (ctx.preview) return head(T('இணையம் தேவை', 'Needs internet')) + `<div class="empty card"><div class="art blue-soft">${ic('cloud', 52, 1.8)}</div><h3>${T('Android ஆப்பில் பயன்படுத்தவும்', 'Use it in the Android app')}</h3><p>${T('இந்த link-க்குள் இணைய இணைப்பு அனுமதிக்கப்படவில்லை. குழுக் கணக்கு Android ஆப்பில் முழுமையாக வேலை செய்யும்.', 'This link does not allow internet connections. Online groups work fully in the Android app.')}</p></div>`;
  if (!signedIn()) return head(T('ஒன்றாக, பாதுகாப்பாக', 'Together, securely')) + loginHtml();
  const list = online.list;
  return head(esc(online.user.email || online.user.phone || '')) + `
    <section class="hero hero-blue"><div class="label">${ic('shield', 16)} ${T('End-to-end பூட்டு', 'End-to-end encrypted')}</div><div class="big sm">${T('குழுவுடன் ஒரே கணக்கு', 'One ledger with your team')}</div><p class="hero-p">${T('பதிவுகள் உங்கள் போனிலேயே பூட்டப்பட்டு server-க்கு அனுப்பப்படும். 10 உறுப்பினர்கள் வரை.', 'Records are locked on your phone before upload. Up to 10 members.')}</p></section>
    <div class="section-h"><h2>${T('என் குழுக்கள்', 'My groups')}</h2></div>
    <div class="list">${list == null ? `<p class="muted center">${T('திறக்கிறது…', 'Loading…')}</p>` : list.length ? list.map(g => `<button class="acc line-l-blue" data-act="ol-open" data-id="${esc(g.id)}">${avatar(g.name)}<span class="meta"><span class="name">${esc(g.name)}</span><span class="when">${g.owner_id === online.user.id ? T('நீங்கள் உருவாக்கியது', 'Created by you') : T('உறுப்பினர்', 'Member')}</span></span><span class="end">${ic('chev', 18)}</span></button>`).join('')
      : `<div class="empty card"><p>${T('குழுவை உருவாக்குங்கள், அல்லது அழைப்புக் குறியீட்டுடன் சேருங்கள்.', 'Create a group, or join with an invite code.')}</p></div>`}</div>
    <div class="row2 mt12"><button class="btn blue-bg" data-act="ol-create">${ic('plus', 20)}${T('புதிய குழு', 'New group')}</button><button class="btn ghost" data-act="ol-join">${ic('login', 20)}${T('குழுவில் சேர்', 'Join group')}</button></div>
    <button class="link-btn mt12 center-block" data-act="ol-restore">${ic('key', 16)}${T('மீட்புக் குறியீடு உள்ளதா?', 'Have a recovery code?')}</button>
    <p class="note center">${T('தனிக் கணக்குகள் தானாகப் பகிரப்படாது.', 'Your personal book is never shared automatically.')}</p>`;
}
function loginHtml() {
  const phone = online.phoneMode;
  return `<form id="ol-login" class="card pad16 stack" novalidate>
    <div class="seg full"><button type="button" class="${phone ? '' : 'on'}" data-act="ol-mode" data-v="email">${T('மின்னஞ்சல்', 'Email')}</button><button type="button" class="${phone ? 'on' : ''}" data-act="ol-mode" data-v="phone">${T('மொபைல்', 'Mobile')}</button></div>
    <div class="field"><label for="ol-id">${phone ? T('மொபைல் எண்', 'Mobile number') : T('மின்னஞ்சல்', 'Email')}</label><input class="input" id="ol-id" type="${phone ? 'tel' : 'email'}" inputmode="${phone ? 'tel' : 'email'}" autocapitalize="none" spellcheck="false" autocomplete="off" value="" placeholder="${phone ? '+91 9876543210' : 'name@example.com'}"></div>
    <div class="field"><label for="ol-pw">${T('கடவுச்சொல்', 'Password')}</label><div class="pw"><input class="input" id="ol-pw" type="password" autocomplete="current-password"><button type="button" class="mini" data-act="ol-eye" aria-label="${T('காட்டு', 'Show')}">${ic('eye', 18)}</button></div></div>
    ${window.LedgerCredentials && !phone ? `<label class="check-row"><input type="checkbox" id="ol-remember" checked> ${T('இந்த போனில் நினைவில் வை', 'Remember on this phone')}</label>` : ''}
    <p class="form-error" role="alert"></p>
    <button class="btn block blue-bg" type="submit">${ic('login', 20)}${T('உள்நுழை', 'Sign in')}</button>
    <div class="row2"><button type="button" class="btn ghost sm" data-act="ol-signup">${T('பதிவு செய்', 'Create account')}</button><button type="button" class="btn ghost sm" data-act="ol-forgot">${T('கடவுச்சொல் மறந்ததா?', 'Forgot password?')}</button></div>
  </form>
  <div class="steps mt14">
    <div class="step"><span class="n blue-bg">1</span><div><b>${T('பதிவு செய்து உள்நுழையுங்கள்', 'Create an account & sign in')}</b><p>${T('மின்னஞ்சல் அல்லது மொபைல் எண்.', 'With email or mobile number.')}</p></div></div>
    <div class="step"><span class="n blue-bg">2</span><div><b>${T('குழுவை உருவாக்குங்கள்', 'Create a group')}</b><p>${T('உறுப்பினர்களை அழைத்து அனுமதி கொடுங்கள்.', 'Invite members and give them access.')}</p></div></div>
    <div class="step"><span class="n blue-bg">3</span><div><b>${T('ஒன்றாகக் கணக்கு எழுதுங்கள்', 'Write the ledger together')}</b><p>${T('பழைய Team Ledger உறுப்பினர்களும் அதே குழுவில் இருக்கலாம்.', 'Members on the old Team Ledger app can stay in the same group.')}</p></div></div>
  </div>`;
}
export function bindOnlineForms(ctx) {
  const f = $('#ol-login'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    const err = f.querySelector('.form-error'), btn = f.querySelector('[type=submit]'), id = $('#ol-id').value.trim(), pw = $('#ol-pw').value;
    let identity;
    try { identity = online.phoneMode ? { phone: normalizePhone(id) } : { email: id }; } catch (x) { err.textContent = x.message; return; }
    if ((!online.phoneMode && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) || !pw) { err.textContent = T('மின்னஞ்சல் / மொபைல், கடவுச்சொல்லைச் சரிபாருங்கள்.', 'Check your email / mobile and password.'); return; }
    btn.disabled = true; err.textContent = T('உள்நுழைகிறது…', 'Signing in…');
    try {
      await signIn(identity, pw);
      if (window.LedgerCredentials && !online.phoneMode) { if ($('#ol-remember') && $('#ol-remember').checked) window.LedgerCredentials.remember(id, pw); else window.LedgerCredentials.forget(id); }
      ls.del && ls.del('tl-login-emails');
      ctx.render(); loadList(ctx);
    } catch (x) { err.textContent = onlineError(x); btn.disabled = false; }
  };
  // Restore a remembered password (Android only, kept in the Android Keystore).
  const idEl = $('#ol-id');
  idEl && idEl.addEventListener('change', () => { if (window.LedgerCredentials && !online.phoneMode) requestSavedPassword(idEl.value.trim()); });
}
let credSeq = 0;
function requestSavedPassword(email) {
  const id = 'ledger_text_' + (++credSeq + 1000);
  window.LedgerFinance = window.LedgerFinance || {};
  window.LedgerFinance.receiveText = (rid, value) => { if (rid === id && value && $('#ol-pw') && !$('#ol-pw').value) $('#ol-pw').value = value; };
  try { window.LedgerCredentials.load(id, email); } catch (e) { }
}
async function signIn(identity, password) {
  const c = client();
  const r = await c.auth.signInWithPassword({ ...identity, password });
  if (r.error) throw r.error;
  const user = r.data.user || (r.data.session && r.data.session.user);
  try { online.vault = await unlockDeviceVault(user.id, password); }
  catch (e) { await c.auth.signOut(); throw e; }
  online.user = user; online.groups = new Groups(c, online.vault); online.lastActivity = Date.now(); online.list = null;
  if (online.vault.needsRecovery) toast(T('கடவுச்சொல் மாறியுள்ளது: குழு மீட்புக் குறியீடு பயன்படுத்தவும்.', 'Password changed: use your group recovery code.'));
}
export async function signOut(ctx) {
  try { await client().auth.signOut(); } catch (e) { }
  if (online.vault) online.vault.clearMemory();
  Object.assign(online, { vault: null, groups: null, user: null, list: null, book: null, team: null });
  try { window.Android && window.Android.clearAttachments && window.Android.clearAttachments(); } catch (e) { }
  ctx.go('online');
}
async function loadList(ctx) {
  try { online.list = await online.groups.list(); } catch (e) { online.list = []; toast(onlineError(e)); }
  ctx.render();
}

/** Ensure the group book for gid is loaded; returns the book or null (and kicks off loading). */
export function groupBook(ctx, gid) {
  if (!signedIn()) return null;
  if (online.book && online.book.id === gid && online.groups.current && online.groups.current.row.id === gid) return online.book;
  if (!online.busy) openGroup(ctx, gid, true);
  return null;
}
async function openGroup(ctx, gid, fromRoute) {
  online.busy = true;
  try {
    try { await online.groups.load(gid); }
    catch (e) {
      if (e.code !== 'KEY_REQUIRED') throw e;
      if (await online.groups.recoverPendingRotation(gid)) await online.groups.load(gid);
      else { online.busy = false; restoreSheet(ctx, gid, e.group); if (fromRoute) ctx.go('online'); return; }
    }
    online.book = createGroupBook(online.groups); online.book.prefix = 'g-' + gid + '-';
    online.team = null;
    if (fromRoute) ctx.render(); else ctx.go('g-' + gid);
  } catch (e) { toast(onlineError(e)); if (fromRoute) ctx.go('online'); }
  finally { online.busy = false; }
}

/* ---------------- team page ---------------- */
export function viewTeam(ctx, book) {
  const c = online.groups.current, admin = c.role === 'admin', owner = c.row.owner_id === c.userId;
  if (!online.team) { loadTeam(ctx); }
  const t = online.team || {}, me = online.user ? (online.user.email || online.user.phone || '') : '';
  return `<div class="topbar"><button class="icon-btn" data-go="g-${esc(c.row.id)}" aria-label="back">${ic('back')}</button><h1>${esc(c.row.name)}<span class="sub line-blue">${T('குழு அமைப்புகள்', 'Team settings')} · ${esc(roleName(c.role))}</span></h1><button class="icon-btn" data-act="team-refresh" aria-label="refresh">${ic('refresh')}</button></div>
    <div class="row2"><button class="btn ghost sm" data-go="g-${esc(c.row.id)}-details">${ic('card', 18)}${T('கணக்கு விவரங்கள்', 'Account Details')}</button><button class="btn ghost sm" data-go="g-${esc(c.row.id)}-report">${ic('chart', 18)}${T('அறிக்கை', 'Report')}</button></div>
    ${!admin ? `<div class="section-h"><h2>${ic('users', 18)} ${T('உறுப்பினர்கள்', 'Members')}</h2></div><div class="menu"><div class="row">${avatar(me || '?')}<span class="tx"><b>${esc(me || '—')} · ${T('நீங்கள்', 'you')}</b><small>${esc(roleName(c.role))} · ${T('முழு பட்டியலை நிர்வாகி மட்டும் பார்க்கலாம்', 'Only admins see the full list')}</small></span></div></div>` : `
    <div class="section-h"><h2>${ic('users', 18)} ${T('உறுப்பினர்கள்', 'Members')} <span class="muted">· ${t.people ? t.people.length : '…'}/10</span></h2>${admin ? `<button class="link-btn blue-t" data-act="team-invite">${ic('plus', 18, 2.6)}${T('அழை', 'Invite')}</button>` : ''}</div>
    <div class="menu">${(t.people || []).map(m => `<div class="row">${avatar(m.label || '?')}<span class="tx"><b>${esc(m.label || '—')}${m.user_id === c.userId ? ' · ' + T('நீங்கள்', 'you') : ''}</b><small>${esc(roleName(m.role))}${m.user_id === c.row.owner_id ? ' · ' + T('உரிமையாளர்', 'owner') : ''}</small></span>
      ${admin && m.user_id !== c.row.owner_id ? `<button class="mini" data-act="team-role" data-id="${esc(m.user_id)}" data-role="${esc(m.role)}" aria-label="${T('அனுமதி', 'Access')}">${ic('key', 18)}</button>` : ''}
      ${admin && m.user_id !== c.row.owner_id && m.user_id !== c.userId ? `<button class="mini red-t" data-act="team-remove" data-id="${esc(m.user_id)}" data-name="${esc(m.label)}" aria-label="${T('நீக்கு', 'Remove')}">${ic('x', 18)}</button>` : ''}</div>`).join('') || `<p class="muted pad16">${t.error ? esc(t.error) : T('திறக்கிறது…', 'Loading…')}</p>`}</div>`}
    ${admin ? `<div class="section-h"><h2>${ic('mail', 18)} ${T('அழைப்புகள்', 'Invitations')}</h2></div><div class="menu">${(t.requests || []).map(r => `<div class="row"><span class="ic blue">${ic('mail')}</span><span class="tx"><b>${esc(r.email)}</b><small>${r.approved ? T('ஒப்புதல் அளிக்கப்பட்டது', 'Approved') : r.public_key ? T('ஒப்புதல் தேவை', 'Ready to approve') : T('உறுப்பினருக்காகக் காத்திருக்கிறது', 'Waiting for member')}</small></span>
      ${r.public_key && !r.approved ? `<button class="btn sm blue-bg" data-act="team-approve" data-id="${esc(r.id)}">${T('ஒப்புதல்', 'Approve')}</button>` : ''}${!r.approved ? `<button class="mini" data-act="team-cancel" data-id="${esc(r.id)}" data-email="${esc(r.email)}" aria-label="cancel">${ic('x', 18)}</button>` : ''}</div>`).join('') || `<p class="muted pad16">${t.requestsError ? esc(t.requestsError) : T('நிலுவையில் அழைப்புகள் இல்லை', 'No pending invitations')}</p>`}</div>` : ''}
    <div class="section-h"><h2>${ic('chat', 18)} ${T('கருத்துகள்', 'Comments')}</h2>${c.role !== 'viewer' ? `<button class="link-btn blue-t" data-act="team-comment">${ic('plus', 18, 2.6)}${T('எழுது', 'Write')}</button>` : ''}</div>
    <div class="menu">${(t.comments || []).slice().sort((a, b) => String(b.value.date).localeCompare(String(a.value.date))).map(x => `<div class="row"><span class="tx"><b class="wrap">${esc(x.value.text)}</b><small>${esc(new Date(x.value.date).toLocaleString('en-IN'))}</small></span></div>`).join('') || `<p class="muted pad16">${T('இன்னும் கருத்துகள் இல்லை', 'No comments yet')}</p>`}</div>
    <div class="section-h"><h2>${ic('key', 18)} ${T('மீட்பு', 'Recovery')}</h2></div>
    <div class="menu">
      ${admin ? `<button class="row" data-act="team-recovery"><span class="ic amber">${ic('key')}</span><span class="tx"><b>${T('மீட்புக் குறியீடு உருவாக்கு', 'Create recovery code')}</b><small>${T('புதிய போனில் இந்தக் குழுவைத் திறக்க 10 எழுத்துக் குறியீடு', 'A 10-character code to open this group on a new phone')}</small></span></button>
      <button class="row" data-act="team-longkey"><span class="ic">${ic('shield')}</span><span class="tx"><b>${T('நீண்ட மீட்புச் சாவி', 'Long recovery key')}</b><small>${T('எல்லா சாதனங்களும் தொலைந்தால் மட்டும்', 'Only if every device is lost')}</small></span></button>` : ''}
      <button class="row" data-act="ol-restore" data-id="${esc(c.row.id)}"><span class="ic">${ic('upload')}</span><span class="tx"><b>${T('குழுவை மீட்டெடு', 'Restore group')}</b></span></button>
    </div>
    ${owner ? `<details class="danger-zone mt18"><summary>${T('குழுவை நிர்வகி', 'Manage this team')}</summary><p class="note">${T('குழுவும் அதன் பகிர்ந்த பதிவுகளும் அனைவருக்கும் நிரந்தரமாக நீங்கும்.', 'Deletes the team and all shared records for every member.')}</p><button class="btn danger block" data-act="team-delete">${ic('trash', 20)}${T('குழுவை நீக்கு', 'Delete team')}</button></details>` : ''}`;
}
async function loadTeam(ctx) {
  online.team = { loading: true };
  const c = online.groups.current, t = {};
  t.people = [];
  if (c.role === 'admin') { try { const { data, error } = await client().rpc('tl2_people', { p_group: c.row.id }); if (error) throw error; t.people = data || []; } catch (e) { t.error = onlineError(e); } }
  if (c.role === 'admin') { try { t.requests = await online.groups.pending(); } catch (e) { t.requests = []; t.requestsError = onlineError(e); } }
  try { t.comments = await online.groups.comments(); } catch (e) { t.comments = []; }
  online.team = t; ctx.render();
}

/* ---------------- sheets ---------------- */
function codeSheet(code, title) {
  const recovery = /^[A-Za-z0-9]{10}$/.test(code), short = recovery || /^[A-Za-z0-9]{8}$/.test(code);
  openSheet(title, `<p class="lead-text">${recovery ? T('இந்த 10 எழுத்துகளைப் பாதுகாத்து வையுங்கள். இதே login-ல் புதிய போனில் மீட்கலாம். புதியது உருவாக்கினால் பழையது செல்லாது.', 'Keep these 10 characters private. Restore on a new phone with the same login. Creating a new one replaces the old one.')
    : short ? T('அழைத்த நபருக்கு மட்டும் இந்தக் குறியீட்டை அனுப்புங்கள். அவர் உள்ளிட்டதும் இங்கே ஒப்புதல் அளியுங்கள். 24 மணிநேரம் செல்லும்.', 'Send this code only to the invited person. After they enter it, approve them here. Valid for 24 hours.')
      : T('இது தனிப்பட்ட மீட்புச் சாவி. யாரிடமும் பகிர வேண்டாம்.', 'This is a private recovery key. Never share it.')}</p>
    <div class="code-box ${short ? 'big' : ''} mono">${esc(code)}</div>`,
    `<button class="btn block blue-bg" id="code-copy">${ic('copy', 20)}${T('நகலெடு', 'Copy')}</button>`);
  $('#code-copy').onclick = () => copyText(code);
}
function restoreSheet(ctx, gid, group) {
  formSheet(T('குழுவை மீட்டெடு', 'Restore group'), `<p class="note">${group ? `<b>${esc(group.name)}</b> — ` : ''}${T('இந்த போனில் குழுச் சாவி இல்லை. நிர்வாகி உருவாக்கிய 10 எழுத்து மீட்புக் குறியீட்டை (அல்லது பழைய நீண்ட சாவியை) உள்ளிடுங்கள். அதை உருவாக்கிய அதே login-ல் இருக்க வேண்டும்.', 'This phone does not have the group key. Enter the 10-character recovery code (or an old long key). Use the same login that created it.')}</p>
    <div class="field"><label for="rc">${T('மீட்புக் குறியீடு', 'Recovery code')}</label><textarea class="input mono" id="rc" rows="2" maxlength="4096" autocomplete="off" spellcheck="false"></textarea></div>
    <p class="note">${T('பழைய ஆப்பில்: குழு → நிர்வாகம் → மீட்பு → “மீட்புக் குறியீடு உருவாக்கு”.', 'In the old app: Group → Team / Admin → Recovery → “Create recovery code”.')}</p>`,
    T('மீட்டெடு', 'Restore'), async () => {
      const code = $('#rc').value.trim(); if (!code) throw Error(T('குறியீட்டை உள்ளிடுங்கள்', 'Enter the code'));
      try { if (/^[A-Za-z0-9]{10}$/.test(code)) await online.groups.restoreShortRecovery(code); else await online.groups.accept(code); }
      catch (e) { throw Error(onlineError(e)); }
      const id = online.groups.current.row.id;
      online.book = createGroupBook(online.groups); online.book.prefix = 'g-' + id + '-'; online.team = null; online.list = null;
      closeSheet(true); ctx.go('g-' + id); toast(T('குழு திறக்கப்பட்டது ✓', 'Group opened ✓')); loadList(ctx);
      return false;
    });
}
async function joinFlow(ctx, code) {
  const result = await online.groups.joinShort(code);
  if (result.status === 'ready') { const id = online.groups.current.row.id; online.book = createGroupBook(online.groups); online.book.prefix = 'g-' + id + '-'; closeSheet(true); online.list = null; ctx.go('g-' + id); toast(T('குழுவில் சேர்ந்துவிட்டீர்கள் ✓', 'Joined ✓')); loadList(ctx); return; }
  if (result.status === 'slow') throw Error(T('பல முயற்சிகள். 15 நிமிடம் கழித்து முயற்சிக்கவும்.', 'Too many attempts. Wait 15 minutes.'));
  if (result.status === 'device') throw Error(T('இந்தக் குறியீடு வேறு சாதனத்தில் பயன்படுத்தப்பட்டுள்ளது. புதிய குறியீடு கேளுங்கள்.', 'This code was used on another device. Ask for a new code.'));
  if (result.status !== 'waiting') throw Error('Invalid invitation');
  openSheet(T('ஒப்புதலுக்காகக் காத்திருக்கிறது', 'Waiting for approval'), `<p class="lead-text">${T('இந்தப் பாதுகாப்பு எண்ணை நிர்வாகியிடம் phone-ல் அல்லது நேரில் சொல்லுங்கள். அவர் சரிபார்த்து ஒப்புதல் தருவார்.', 'Tell your admin this safety number by phone or in person. They check it and approve you.')}</p><div class="code-box big mono">${esc(result.fingerprint)}</div>`,
    `<button class="btn block blue-bg" id="join-check">${ic('refresh', 20)}${T('ஒப்புதலைச் சரிபார்', 'Check approval')}</button>`);
  $('#join-check').onclick = async () => { $('#join-check').disabled = true; try { await joinFlow(ctx, code); } catch (e) { toast(onlineError(e)); } finally { if ($('#join-check')) $('#join-check').disabled = false; } };
}

export const onlineActions = {
  'ol-mode': (ctx, b) => { online.phoneMode = b.dataset.v === 'phone'; ctx.render(); },
  'ol-eye': (ctx, b) => { const shown = toggleSecret($('#ol-pw')); b.innerHTML = ic(shown ? 'eyeoff' : 'eye', 18); },
  'ol-refresh': ctx => { online.list = null; ctx.render(); loadList(ctx); },
  'ol-signout': async ctx => { if (await confirmBox(T('வெளியேறவா?', 'Sign out?'), T('குழுத் தகவல்கள் server-ல் பாதுகாப்பாக இருக்கும்.', 'Your group data stays safe on the server.'), T('வெளியேறு', 'Sign out'))) signOut(ctx); },
  'ol-open': (ctx, b) => openGroup(ctx, b.dataset.id, false),
  'ol-create': ctx => formSheet(T('புதிய குழு', 'New group'), fieldHtml('gname', T('குழுவின் பெயர்', 'Group name'), '', 'text', 'maxlength="80"') + `<p class="note">${T('குழு உருவாக்கியதும் “மீட்புக் குறியீடு” எடுத்து பத்திரமாக வைத்துக்கொள்ளுங்கள்.', 'After creating, make a recovery code and keep it safe.')}</p>`, T('உருவாக்கு', 'Create'), async () => {
    const name = $('#gname').value.trim(); if (!name) throw Error(T('பெயர் தேவை', 'Name is required'));
    try { await online.groups.create(name); } catch (e) { throw Error(onlineError(e)); }
    const id = online.groups.current.row.id; online.book = createGroupBook(online.groups); online.book.prefix = 'g-' + id + '-'; online.list = null;
    closeSheet(true); ctx.go('g-' + id); toast(T('குழு தயார் ✓ — உறுப்பினர்களை அழைக்கலாம்', 'Group ready ✓ — invite members')); loadList(ctx); return false;
  }),
  'ol-join': ctx => formSheet(T('குழுவில் சேர்', 'Join group'), fieldHtml('jcode', T('8 எழுத்து அழைப்புக் குறியீடு', '8-character invite code'), '', 'text', 'maxlength="8" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Ab3dEf7H" class="input mono"') + `<p class="note">${T('நிர்வாகி அழைத்த அதே மின்னஞ்சல் / மொபைலில் உள்நுழைந்திருக்க வேண்டும். பெரிய / சிறிய எழுத்துகளை அப்படியே உள்ளிடுங்கள்.', 'Sign in with the email / mobile your admin invited. Upper and lower case matter.')}</p>`, T('சேர்', 'Join'), async () => {
    const code = $('#jcode').value.trim(); try { await joinFlow(ctx, code); } catch (e) { throw Error(onlineError(e)); } return false;
  }),
  'ol-restore': (ctx, b) => restoreSheet(ctx, b.dataset.id || null, null),
  'ol-signup': ctx => openSheet(T('பதிவு செய்', 'Create account'), `<div class="menu"><button class="row" data-act="ol-signup-email"><span class="ic blue">${ic('mail')}</span><span class="tx"><b>${T('மின்னஞ்சல்', 'Email')}</b></span></button><button class="row" data-act="ol-signup-phone"><span class="ic blue">${ic('phone')}</span><span class="tx"><b>${T('மொபைல் · SMS OTP', 'Mobile · SMS OTP')}</b></span></button></div>`),
  'ol-signup-email': ctx => formSheet(T('மின்னஞ்சலில் பதிவு', 'Sign up with email'), fieldHtml('su-email', T('மின்னஞ்சல்', 'Email'), '', 'email', 'autocomplete="email"') + fieldHtml('su-pw', T('கடவுச்சொல் (8+ எழுத்து, எழுத்தும் எண்ணும்)', 'Password (8+ with letters and numbers)'), '', 'password', 'autocomplete="new-password"'), T('பதிவு செய்', 'Create account'), async () => {
    const email = $('#su-email').value.trim(), pw = $('#su-pw').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error(T('மின்னஞ்சலைச் சரிபாருங்கள்', 'Check the email'));
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw Error(T('குறைந்தது 8 எழுத்துகள்; ஆங்கில எழுத்தும் எண்ணும் சேர்க்கவும்.', 'Use at least 8 characters with a letter and a number.'));
    const r = await client().auth.signUp({ email, password: pw, options: { emailRedirectTo: REDIRECT() } }); if (r.error) throw Error(onlineError(r.error));
    if (r.data && r.data.session) await client().auth.signOut();
    toast(T('மின்னஞ்சலைத் திறந்து உறுதிப்படுத்தியபின் உள்நுழையுங்கள்.', 'Open your email, confirm it, then sign in.'));
  }),
  'ol-signup-phone': ctx => formSheet(T('மொபைலில் பதிவு', 'Sign up with mobile'), fieldHtml('sp-phone', T('நாடு குறியீட்டுடன் மொபைல் எண்', 'Mobile number with country code'), '', 'tel', 'inputmode="tel" placeholder="+91 9876543210"') + fieldHtml('sp-pw', T('கடவுச்சொல் (8+)', 'Password (8+)'), '', 'password', 'autocomplete="new-password"'), T('SMS OTP அனுப்பு', 'Send SMS OTP'), async () => {
    const phone = normalizePhone($('#sp-phone').value), pw = $('#sp-pw').value;
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw Error(T('8+ எழுத்துகள்; எழுத்தும் எண்ணும்.', '8+ characters with letters and numbers.'));
    const st = await client().auth.settings().catch(() => null); if (!st || !st.external || st.external.phone !== true) throw Error(T('SMS சேவை இன்னும் இணைக்கப்படவில்லை. Email பயன்படுத்தலாம்.', 'SMS is not set up yet. Use email for now.'));
    const r = await client().auth.signUp({ phone, password: pw, options: { channel: 'sms' } }); if (r.error) throw Error(phoneError(r.error, lang() === 'ta'));
    if (r.data && r.data.session) await client().auth.signOut();
    closeSheet(true);
    formSheet(T('மொபைல் உறுதிப்படுத்து', 'Verify mobile'), `<p class="lead-text">${esc(phone)}</p>` + fieldHtml('otp', T('SMS குறியீடு', 'SMS code'), '', 'text', 'inputmode="numeric" autocomplete="one-time-code" maxlength="10"'), T('OTP சரிபார்', 'Verify OTP'), async () => {
      const token = $('#otp').value.trim(); if (!/^[0-9]{6,10}$/.test(token)) throw Error(T('SMS குறியீட்டை உள்ளிடுங்கள்', 'Enter the SMS code'));
      const v = await client().auth.verifyOtp({ phone, token, type: 'sms' }); if (v.error) throw Error(phoneError(v.error, lang() === 'ta'));
      await client().auth.signOut(); online.phoneMode = true; ctx.render(); toast(T('எண் உறுதிப்படுத்தப்பட்டது. உள்நுழையுங்கள்.', 'Mobile confirmed. Sign in.'));
    });
    return false;
  }),
  'ol-forgot': ctx => formSheet(T('Online கடவுச்சொல்லை மாற்று', 'Reset online password'), fieldHtml('fp-email', T('பதிவு செய்த மின்னஞ்சல்', 'Registered email'), ($('#ol-id') && $('#ol-id').value.includes('@')) ? $('#ol-id').value : '', 'email') + `<p class="note">${T('இதே போனில் சமீபத்திய reset மின்னஞ்சலை மட்டும் திறக்கவும். மாற்றிய பின் குழு மீட்புக் குறியீடு தேவைப்படலாம்.', 'Open only the newest reset email on this phone. A group recovery code may be needed afterwards.')}</p>`, T('Reset link அனுப்பு', 'Send reset link'), async () => {
    const email = $('#fp-email').value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error(T('மின்னஞ்சலைச் சரிபாருங்கள்', 'Check the email'));
    const r = await client().auth.resetPasswordForEmail(email, { redirectTo: REDIRECT() }); if (r.error) throw Error(onlineError(r.error));
    toast(T('மின்னஞ்சல் பதிவு செய்யப்பட்டிருந்தால் reset link வரும்.', 'If this email is registered, a reset link will arrive.'));
  }),
  'group-refresh': async ctx => { try { await online.book.reload(); online.team = null; ctx.render(); toast(T('புதுப்பிக்கப்பட்டது', 'Up to date')); } catch (e) { toast(onlineError(e)); } },
  'team-refresh': async ctx => { online.team = null; try { await online.book.reload(); } catch (e) { toast(onlineError(e)); } ctx.render(); },
  'team-invite': ctx => formSheet(T('உறுப்பினரை அழை', 'Invite a member'), fieldHtml('iv-id', T('மின்னஞ்சல் அல்லது மொபைல் எண்', 'Email or mobile number'), '', 'text', 'maxlength="254" autocapitalize="none"') +
    `<div class="field"><span class="lbl">${T('அனுமதி', 'Access')}</span><div class="role-pick">${['viewer', 'commenter', 'editor', 'admin'].map((r, i) => `<label class="check-row"><input type="radio" name="iv-role" value="${r}" ${i === 2 ? 'checked' : ''}> <b>${roleName(r)}</b> <small class="muted">${{ viewer: T('பார்க்க மட்டும்', 'view only'), commenter: T('பார்த்து கருத்து எழுதலாம்', 'view and comment'), editor: T('பதிவுகள் சேர்க்கலாம், திருத்தலாம்', 'add and edit records'), admin: T('உறுப்பினர்களையும் நிர்வகிக்கலாம்', 'also manage members') }[r]}</small></label>`).join('')}</div></div>`, T('குறியீடு உருவாக்கு', 'Create code'), async () => {
      let who; try { who = normalizeContact($('#iv-id').value); } catch (e) { throw Error(e.message); }
      const role = document.querySelector('[name=iv-role]:checked').value;
      let code; try { code = await online.groups.inviteShort(who, role); } catch (e) { throw Error(onlineError(e)); }
      closeSheet(true); codeSheet(code, T('அழைப்புக் குறியீடு', 'Invite code')); online.team = null; ctx.render(); return false;
    }),
  'team-approve': async (ctx, b) => {
    const req = (online.team.requests || []).find(r => String(r.id) === b.dataset.id); if (!req) return;
    const mark = await fingerprint(req.public_key);
    formSheet(T('உறுப்பினரை உறுதிசெய்', 'Verify member'), `<p class="lead-text">${esc(req.email)}</p><div class="code-box big mono">${esc(mark)}</div><label class="check-row mt10"><input type="checkbox" id="ap-ok"> ${T('இந்த எண்ணை உறுப்பினரிடம் phone-ல் அல்லது நேரில் சரிபார்த்தேன்.', 'I checked this number with the member by phone or in person.')}</label>`, T('ஒப்புதல்', 'Approve'), async () => {
      if (!$('#ap-ok').checked) throw Error(T('முதலில் எண்ணைச் சரிபார்த்து டிக் செய்யவும்', 'Check the number first and tick the box'));
      try { await online.groups.approve(req); } catch (e) { throw Error(onlineError(e)); } online.team = null; ctx.render(); toast(T('ஒப்புதல் அளிக்கப்பட்டது ✓', 'Approved ✓'));
    });
  },
  'team-cancel': async (ctx, b) => { if (!await confirmBox(T('அழைப்பை ரத்து செய்யவா?', 'Cancel invite?'), b.dataset.email, T('ரத்து செய்', 'Cancel invite'), true)) return; try { await online.groups.cancelInvite(b.dataset.id); online.team = null; ctx.render(); } catch (e) { toast(onlineError(e)); } },
  'team-role': (ctx, b) => openSheet(T('அனுமதி', 'Access'), `<div class="menu">${['viewer', 'commenter', 'editor', 'admin'].map(r => `<button class="row" data-act="team-setrole" data-id="${esc(b.dataset.id)}" data-role="${r}"><span class="tx"><b>${roleName(r)}</b></span>${b.dataset.role === r ? `<span class="end">${ic('check', 18)}</span>` : ''}</button>`).join('')}</div>`),
  'team-setrole': async (ctx, b) => { closeSheet(true); try { await online.groups.setRole(b.dataset.id, b.dataset.role); online.book.refresh(); online.team = null; ctx.render(); toast(T('அனுமதி மாற்றப்பட்டது', 'Access changed')); } catch (e) { toast(onlineError(e)); } },
  'team-remove': async (ctx, b) => {
    if (!await confirmBox(T('உறுப்பினரை நீக்கவா?', 'Remove member?'), TP('{n} நீக்கப்படுவார். குழுச் சாவி மாற்றப்படும்; மற்ற உறுப்பினர்களுக்கு புதிய மீட்புக் குறியீடு தேவைப்படலாம்.', '{n} will be removed. The group key changes; other members may need a new recovery code.', { n: b.dataset.name }), T('நீக்கு', 'Remove'), true)) return;
    try { const code = await online.groups.removeMember(b.dataset.id); online.book.refresh(); online.team = null; ctx.render(); codeSheet(code, T('புதிய மீட்புச் சாவி', 'New recovery key')); } catch (e) { toast(onlineError(e)); }
  },
  'team-recovery': async ctx => { try { codeSheet(await online.groups.shortRecovery(), T('மீட்புக் குறியீடு', 'Recovery code')); } catch (e) { toast(onlineError(e)); } },
  'team-longkey': ctx => { try { codeSheet(online.groups.accessCode(), T('நீண்ட மீட்புச் சாவி', 'Long recovery key')); } catch (e) { toast(onlineError(e)); } },
  'team-comment': ctx => formSheet(T('கருத்து', 'Comment'), `<div class="field"><textarea class="input" id="cm" maxlength="2000" rows="4"></textarea></div>`, T('அனுப்பு', 'Post'), async () => {
    const text = $('#cm').value.trim(); if (!text) throw Error(T('கருத்தை எழுதுங்கள்', 'Write a comment'));
    try { await online.groups.comment(text); } catch (e) { throw Error(onlineError(e)); } online.team = null; ctx.render();
  }),
  'team-delete': ctx => { const g = online.groups.current.row; formSheet(T('குழுவை நீக்கு', 'Delete team'), `<p class="lead-text">${T('உறுதிப்படுத்த குழுப் பெயரை உள்ளிடுங்கள்:', 'Type the team name to confirm:')} <b>${esc(g.name)}</b></p>` + fieldHtml('dg', T('குழுப் பெயர்', 'Team name'), ''), T('நிரந்தரமாக நீக்கு', 'Delete permanently'), async () => {
    if ($('#dg').value !== g.name) throw Error(T('குழுப் பெயர் பொருந்தவில்லை.', 'Team name does not match.'));
    const { error } = await client().rpc('tl4_delete_group', { p_group: g.id, p_name: g.name }); if (error) throw Error(onlineError(error));
    online.groups.current = null; online.book = null; online.list = null; closeSheet(true); ctx.go('online'); loadList(ctx); return false;
  }); }
};

/* Email confirmation / password reset links arrive here (Android passes teamledgergroup://auth?code=…). */
export async function handleAuthLink(ctx, url) {
  try {
    const u = new URL(url); const code = u.searchParams.get('code');
    if (!code) { toast(T('Link திறக்க முடியவில்லை. புதிய link கேளுங்கள்.', 'The link could not open. Request a new one.')); return; }
    const r = await client().auth.exchangeCodeForSession(code);
    if (r.error) { toast(T('Link காலாவதியானது அல்லது ஏற்கனவே பயன்படுத்தப்பட்டது.', 'The link expired or was already used.')); return; }
    if (r.data.redirectType !== 'recovery') { await client().auth.signOut(); ctx.go('online'); toast(T('மின்னஞ்சல் உறுதிப்படுத்தப்பட்டது. உள்நுழையுங்கள்.', 'Email confirmed. Sign in.')); return; }
    ctx.go('online');
    formSheet(T('புதிய கடவுச்சொல்', 'New password'), fieldHtml('np1', T('புதிய கடவுச்சொல் (8+)', 'New password (8+)'), '', 'password', 'autocomplete="new-password"') + fieldHtml('np2', T('மீண்டும்', 'Again'), '', 'password', 'autocomplete="new-password"'), T('மாற்று', 'Change'), async () => {
      const p = $('#np1').value; if (p.length < 8) throw Error(T('குறைந்தது 8 எழுத்துகள்', 'At least 8 characters')); if (p !== $('#np2').value) throw Error(T('இரண்டும் பொருந்தவில்லை', 'Passwords do not match'));
      const x = await client().auth.updateUser({ password: p }); if (x.error) throw Error(onlineError(x.error));
      await client().auth.signOut(); toast(T('கடவுச்சொல் மாற்றப்பட்டது. புதிய கடவுச்சொல்லுடன் உள்நுழையுங்கள்.', 'Password changed. Sign in with the new password.'));
    });
  } catch (e) { toast(onlineError(e)); }
}
/* Lock the online session after 15 minutes without activity. */
export function idleCheck(ctx) {
  if (signedIn() && Date.now() - online.lastActivity > 15 * 60 * 1000) { signOut(ctx); toast(T('பாதுகாப்பிற்காகப் பூட்டப்பட்டது. மீண்டும் உள்நுழையுங்கள்.', 'Locked for safety. Sign in again.')); }
}
