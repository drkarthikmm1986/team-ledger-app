/* Team Ledger · Owner — the owner's dashboard as its own app, built on the Team Ledger design system.
   Screens: Overview · Users · Reviews · Revenue · More. Data: Supabase (owner login only, tl_is_owner()). */
import { $, esc, T, ic, ls, lang, setLang, loadLang } from './core/util.js';
import { toast, openSheet, closeSheet, confirmBox, formSheet, fieldHtml, hardenInputs } from './ui/kit.js';

const URL_ = 'https://lqaeeninvmcooxdszlny.supabase.co', KEY = 'sb_publishable_q4mpCgLWSjfN-36mjXnLDA_D_lKK6PP';
const SITE = 'https://drkarthikmm1986.github.io/team-ledger-app/';
const nf = new Intl.NumberFormat('en-IN'), rs = p => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format((p || 0) / 100);
const S = { tab: 'home', data: null, reviews: [], revenue: [], busy: false, err: '' };

/* ---------- session (kept on this phone; refreshed automatically) ---------- */
let sess = (() => { try { return JSON.parse(ls.get('tl-owner-session', 'null')); } catch (e) { return null; } })();
const saveSess = s => { sess = s; if (s) ls.set('tl-owner-session', JSON.stringify(s)); else ls.del('tl-owner-session'); };
async function auth(body, grant) {
  const r = await fetch(URL_ + '/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(/invalid/i.test(j.error_code || j.msg || j.error_description || '') ? T('மின்னஞ்சல் / கடவுச்சொல் சரியில்லை', 'Wrong email or password') : (j.msg || j.error_description || 'HTTP ' + r.status));
  saveSess({ access: j.access_token, refresh: j.refresh_token, email: j.user && j.user.email });
}
async function call(path, opt, retried) {
  opt = opt || {};
  const r = await fetch(URL_ + path, Object.assign({}, opt, { headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + (sess ? sess.access : KEY), 'Content-Type': 'application/json' }, opt.headers || {}) }));
  if (r.status === 401 && sess && sess.refresh && !retried) { try { await auth({ refresh_token: sess.refresh }, 'refresh_token'); return call(path, opt, true); } catch (e) { saveSess(null); render(); throw e; } }
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
  if (!r.ok) throw Error((j && (j.message || j.msg)) || ('HTTP ' + r.status));
  return j;
}
async function load() {
  S.busy = true; S.err = ''; render();
  try {
    [S.data, S.reviews, S.revenue] = await Promise.all([
      call('/rest/v1/rpc/tl_owner_summary', { method: 'POST', body: '{}' }),
      call('/rest/v1/tl_reviews?select=*&order=created_at.desc&limit=300'),
      call('/rest/v1/tl_revenue?select=*&order=day.desc&limit=200')
    ]);
  } catch (e) { S.err = /owner only/i.test(e.message) ? T('இந்தக் கணக்கு உரிமையாளர் கணக்கு அல்ல.', 'This login is not the owner account.') : /fetch|network/i.test(e.message) ? T('இணைய இணைப்பு இல்லை.', 'No internet connection.') : e.message; }
  S.busy = false; render();
}

/* ---------- small charts ---------- */
function bars(list, color) {
  const map = new Map((list || []).map(x => [x.d, x.n])), days = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); days.push([k, map.get(k) || 0]); }
  const max = Math.max(1, ...days.map(x => x[1]));
  return `<div class="o-bars">${days.map(([d, n]) => `<i style="height:${Math.max(2, n / max * 100)}%;${color ? 'background:' + color : ''}" title="${d}: ${n}"></i>`).join('')}</div><div class="o-axis"><span>${days[0][0].slice(5)}</span><span>${T('இன்று', 'Today')}</span></div>`;
}
function split(obj) {
  const e = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]); if (!e.length) return `<p class="note pad16">—</p>`;
  const tot = e.reduce((n, x) => n + x[1], 0);
  return e.map(([k, v]) => `<div class="o-split"><span>${esc(k || '—')}</span><em><i style="width:${v / tot * 100}%"></i></em><b class="num">${nf.format(v)}</b></div>`).join('');
}
const stars = n => '★★★★★'.slice(0, n) + '<span class="o-off">' + '★★★★★'.slice(0, 5 - n) + '</span>';
const stat = (label, value, sub, cls) => `<div class="stat"><small>${label}</small><b class="num ${cls || ''}">${value}</b>${sub ? `<span class="o-sub">${sub}</span>` : ''}</div>`;

/* ---------- screens ---------- */
const top = (title, sub) => `<div class="topbar"><span class="logo">${ic('chart', 22, 2.6)}</span><h1>${title}<span class="sub">${sub}</span></h1>${sess ? `<button class="icon-btn" data-act="refresh" aria-label="refresh">${ic('refresh')}</button>` : ''}</div>`;
function viewLogin() {
  return top('Team Ledger · Owner', T('உரிமையாளர் கட்டுப்பாட்டு பலகை', 'Owner dashboard')) + `
    <section class="hero"><div class="label">${ic('shield', 16)} ${T('உங்களுக்கு மட்டும்', 'Only for you')}</div><div class="big sm">${T('பயனர்கள், Downloads, Reviews, வருமானம்', 'Users, downloads, reviews, revenue')}</div><p class="hero-p">${T('Team Ledger-ல் உருவாக்கிய அதே login. உரிமையாளர் மின்னஞ்சல் மட்டுமே எண்களைப் பார்க்கலாம்.', 'The same login you use in Team Ledger. Only the owner email can see the numbers.')}</p></section>
    <form id="lf" class="card pad16 stack mt14" novalidate>
      <div class="field"><label for="em">${T('மின்னஞ்சல்', 'Email')}</label><input class="input" id="em" type="email" placeholder="name@example.com"></div>
      <div class="field"><label for="pw">${T('கடவுச்சொல்', 'Password')}</label><input class="input" id="pw" type="password"></div>
      <p class="form-error" role="alert">${esc(S.err)}</p>
      <button class="btn block" type="submit">${ic('login', 20)}${T('உள்நுழை', 'Sign in')}</button>
    </form>`;
}
function viewHome() {
  const s = S.data || {};
  return top(T('கண்ணோட்டம்', 'Overview'), new Date().toLocaleDateString(lang() === 'ta' ? 'ta-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' })) + `
    <section class="hero">
      <div class="label">${T('இன்று பயன்படுத்தியவர்கள்', 'Active today')}</div>
      <div class="big num">${nf.format(s.active_today || 0)}</div>
      <div class="pills"><div class="pill"><small>${T('7 நாள்', '7 days')}</small><b class="num">${nf.format(s.active_7 || 0)}</b></div><div class="pill"><small>${T('30 நாள்', '30 days')}</small><b class="num">${nf.format(s.active_30 || 0)}</b></div></div>
    </section>
    <div class="stats">
      ${stat(T('மொத்த பயனர்கள்', 'Total users'), nf.format(s.users_total || 0), '+' + nf.format(s.new_7 || 0) + ' ' + T('இந்த வாரம்', 'this week'))}
      ${stat('Downloads', nf.format(s.downloads_total || 0), '+' + nf.format(s.downloads_7 || 0) + ' ' + T('இந்த வாரம்', 'this week'))}
      ${stat(T('மதிப்பீடு', 'Rating'), s.stars_avg ? s.stars_avg + ' ★' : '—', nf.format(s.reviews_total || 0) + ' ' + T('மதிப்பீடுகள்', 'reviews'), 'o-gold')}
      ${stat(T('வருமானம்', 'Revenue'), rs(s.revenue_total), T('இந்த மாதம்', 'This month') + ' ' + rs(s.revenue_month), 'in')}
    </div>
    <div class="section-h"><h2>${T('தினசரி பயனர்கள் (30 நாள்)', 'Daily users (30 days)')}</h2></div>
    <div class="card pad16">${bars(s.daily_active)}</div>
    <div class="section-h"><h2>${T('தினசரி Downloads (30 நாள்)', 'Daily downloads (30 days)')}</h2></div>
    <div class="card pad16">${bars(s.daily_downloads, 'var(--blue)')}</div>`;
}
function viewUsers() {
  const s = S.data || {};
  return top(T('பயனர்கள்', 'Users'), T('கடந்த 30 நாள்', 'Last 30 days')) + `
    <div class="stats">
      ${stat(T('நிறுவியவர்கள்', 'Installed'), nf.format(s.installed || 0), 'APK / Home screen')}
      ${stat(T('புதியவர்கள்', 'New'), nf.format(s.new_7 || 0), T('இந்த வாரம்', 'this week'))}
    </div>
    <div class="section-h"><h2>${T('எந்த போன்', 'Platform')}</h2></div><div class="card pad16">${split(s.by_platform)}</div>
    <div class="section-h"><h2>${T('பதிப்பு', 'Version')}</h2></div><div class="card pad16">${split(s.by_version)}</div>
    <div class="section-h"><h2>${T('மொழி', 'Language')}</h2></div><div class="card pad16">${split(s.by_lang)}</div>
    <p class="note center mt14">${T('ஆப் தினமும் ஒருமுறை பெயரில்லா “திறக்கப்பட்டது” மட்டும் அனுப்பும். கணக்கு விவரம் எதுவும் வராது.', 'The app sends only one anonymous “opened today” signal per day. No ledger data is ever sent.')}</p>`;
}
function viewReviews() {
  const s = S.data || {}, dist = s.stars_dist || {}, tot = Math.max(1, s.reviews_total || 0);
  return top(T('மதிப்பீடுகள்', 'Reviews'), (s.stars_avg ? s.stars_avg + ' ★ · ' : '') + nf.format(s.reviews_total || 0)) + `
    <div class="card pad16">${[5, 4, 3, 2, 1].map(n => `<div class="o-split"><span class="o-gold">${stars(n)}</span><em><i style="width:${(dist[n] || 0) / tot * 100}%;background:var(--amber)"></i></em><b class="num">${dist[n] || 0}</b></div>`).join('')}</div>
    <div class="section-h"><h2>${T('எல்லா மதிப்பீடுகளும்', 'All reviews')}</h2></div>
    <div class="menu">${S.reviews.length ? S.reviews.map(r => `<div class="row o-review ${r.hidden ? 'o-hid' : ''}"><span class="tx"><b class="o-gold">${stars(r.stars)}</b><small>${esc(r.name || '—')} · ${esc(r.platform || '')} · v${esc(r.version || '')} · ${new Date(r.created_at).toLocaleDateString('en-IN')}</small>${r.text ? `<span class="o-text">${esc(r.text)}</span>` : ''}</span>
      <button class="mini" data-act="hide" data-id="${r.id}" data-v="${!r.hidden}" aria-label="hide">${ic(r.hidden ? 'eye' : 'eyeoff', 18)}</button></div>`).join('') : `<p class="muted pad16">${T('இன்னும் மதிப்பீடு இல்லை', 'No reviews yet')}</p>`}</div>
    <p class="note center mt14">${T('👁 = இணையதளத்தில் மறை / காட்டு (spam-க்கு மட்டும்).', '👁 = hide / show on the website (for spam only).')}</p>`;
}
function viewRevenue() {
  const s = S.data || {};
  return top(T('வருமானம்', 'Revenue'), T('மொத்தம்', 'Total') + ' ' + rs(s.revenue_total)) + `
    <div class="stats">${stat(T('இந்த மாதம்', 'This month'), rs(s.revenue_month), '', 'in')}${stat(T('மொத்தம்', 'Total'), rs(s.revenue_total))}</div>
    <button class="btn block mt14" data-act="rev-add">${ic('plus', 20, 3)}${T('வருமானம் சேர்', 'Add revenue')}</button>
    <div class="section-h"><h2>${T('பதிவுகள்', 'Entries')}</h2></div>
    <div class="menu">${S.revenue.length ? S.revenue.map(r => `<div class="row"><span class="tx"><b>${esc(r.source || T('வருமானம்', 'Revenue'))}</b><small>${esc(r.day)}${r.note ? ' · ' + esc(r.note) : ''}</small></span><b class="num in">${rs(r.amount_paise)}</b><button class="mini red-t" data-act="rev-del" data-id="${r.id}" aria-label="delete">${ic('x', 18)}</button></div>`).join('') : `<p class="muted pad16">${T('இன்னும் பதிவு இல்லை. ஆப் இலவசம்; விளம்பரம், subscription போன்ற வருமானத்தை இங்கே சேர்க்கலாம்.', 'Nothing yet. The app is free; record income such as ads or subscriptions here.')}</p>`}</div>`;
}
function viewMore() {
  return top(T('மேலும்', 'More'), sess && sess.email ? esc(sess.email) : '') + `
    <div class="menu">
      <div class="row"><span class="ic">${ic('lang')}</span><span class="tx"><b>${T('மொழி', 'Language')}</b></span><span class="seg"><button class="${lang() === 'ta' ? 'on' : ''}" data-act="lang" data-v="ta">தமிழ்</button><button class="${lang() === 'en' ? 'on' : ''}" data-act="lang" data-v="en">English</button></span></div>
      <a class="row link-row" href="${SITE}" target="_blank" rel="noopener"><span class="ic green">${ic('link')}</span><span class="tx"><b>${T('இணையதளம்', 'Website')}</b><small>${SITE.replace('https://', '')}</small></span></a>
      <button class="row" data-act="logout"><span class="ic red">${ic('logout')}</span><span class="tx"><b>${T('வெளியேறு', 'Sign out')}</b></span></button>
    </div>
    <p class="note center mt22">Team Ledger · Owner 1.0</p>`;
}
const TABS = () => [['home', 'home', T('முகப்பு', 'Home')], ['users', 'users', T('பயனர்கள்', 'Users')], ['reviews', 'star', T('மதிப்பீடு', 'Reviews')], ['revenue', 'coin', T('வருமானம்', 'Revenue')], ['more', 'more', T('மேலும்', 'More')]];
function render() {
  let html;
  if (!sess) html = viewLogin();
  else if (S.busy && !S.data) html = top('Team Ledger · Owner', T('ஏற்றுகிறது…', 'Loading…')) + '<div class="loader"><span></span></div>';
  else if (S.err && !S.data) html = top('Team Ledger · Owner', '') + `<div class="empty card"><div class="art">${ic('info', 52, 1.8)}</div><h3>${esc(S.err)}</h3><button class="btn" data-act="refresh">${ic('refresh', 20)}${T('மீண்டும் முயற்சி', 'Try again')}</button> <button class="btn ghost mt8" data-act="logout">${T('வெளியேறு', 'Sign out')}</button></div>`;
  else html = { home: viewHome, users: viewUsers, reviews: viewReviews, revenue: viewRevenue, more: viewMore }[S.tab]();
  $('#app').innerHTML = `<div class="screen no-actions fade-in">${html}</div>${sess ? `<nav class="dock"><div class="tabs" role="tablist">${TABS().map(([k, icon, label]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-tab="${k}">${ic(icon)}<span>${label}</span></button>`).join('')}</div></nav>` : ''}`;
  hardenInputs($('#app'));
  const f = $('#lf');
  if (f) f.onsubmit = async e => {
    e.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true; f.querySelector('.form-error').textContent = T('உள்நுழைகிறது…', 'Signing in…');
    try { await auth({ email: $('#em').value.trim(), password: $('#pw').value }, 'password'); S.err = ''; await load(); }
    catch (x) { S.err = /fetch/i.test(x.message) ? T('இணைய இணைப்பு இல்லை.', 'No internet connection.') : x.message; render(); }
  };
}
document.addEventListener('click', async ev => {
  const t = ev.target.closest('[data-tab]'); if (t) { S.tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  try {
    if (a === 'refresh') await load();
    else if (a === 'logout') { saveSess(null); S.data = null; S.tab = 'home'; render(); }
    else if (a === 'lang') { await setLang(b.dataset.v); render(); }
    else if (a === 'sheet-close') closeSheet();
    else if (a === 'hide') { await call('/rest/v1/tl_reviews?id=eq.' + b.dataset.id, { method: 'PATCH', body: JSON.stringify({ hidden: b.dataset.v === 'true' }) }); await load(); toast(b.dataset.v === 'true' ? T('மறைக்கப்பட்டது', 'Hidden') : T('காட்டப்படுகிறது', 'Shown')); }
    else if (a === 'rev-del') { if (await confirmBox(T('நீக்கவா?', 'Delete?'), T('இந்த வருமானப் பதிவு நீக்கப்படும்.', 'This revenue entry will be deleted.'), T('நீக்கு', 'Delete'), true)) { await call('/rest/v1/tl_revenue?id=eq.' + b.dataset.id, { method: 'DELETE' }); await load(); } }
    else if (a === 'rev-add') formSheet(T('வருமானம் சேர்', 'Add revenue'), fieldHtml('ra', T('தொகை ₹', 'Amount ₹'), '', 'number', 'inputmode="decimal" step="0.01"') + fieldHtml('rd', T('தேதி', 'Date'), new Date().toISOString().slice(0, 10), 'date') + fieldHtml('rsrc', T('மூலம் (உதா: விளம்பரம்)', 'Source (e.g. Ads)'), '') + fieldHtml('rn', T('குறிப்பு', 'Note'), ''), T('சேமி', 'Save'), async () => {
      const amt = Math.round(Number($('#ra').value) * 100); if (!amt) throw Error(T('தொகையை அடிக்கவும்', 'Please type the amount'));
      await call('/rest/v1/tl_revenue', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ day: $('#rd').value, amount_paise: amt, source: $('#rsrc').value.trim().slice(0, 60), note: $('#rn').value.trim().slice(0, 300) }) });
      await load(); toast(T('சேமிக்கப்பட்டது', 'Saved'));
    });
  } catch (e) { toast(e.message); }
});
window.closeLedgerPanel = () => { if (document.querySelector('#sheet-root .sheet')) { closeSheet(); return true; } if (S.tab !== 'home' && sess) { S.tab = 'home'; render(); return true; } return false; };
(async () => {
  if (!['ta', 'en'].includes(lang())) await setLang('ta');
  await loadLang();
  render();
  const sp = $('#splash'); if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 600); }
  if (sess) load();
})();
