/* Team Ledger 4 — app shell: state, router, tab bar, event dispatch. */
import { $, T, ic, CFG, lang, setLang, ls, native, VERSION } from './core/util.js';
import { createLocalBook } from './data/local-book.js';
import { toast, closeSheet, sheetOpen, sheetState, hardenInputs } from './ui/kit.js';
import { viewHome, viewAccount, viewReport, ledgerActions, fromSafeId } from './views/ledger.js';
import { viewDetails, detailsActions, bindDetailsForms } from './views/details.js';
import { viewOnline, viewTeam, onlineActions, bindOnlineForms, groupBook, online, onlineError, handleAuthLink, idleCheck, signedIn } from './views/online.js';
import { viewMore, moreActions, applyTheme, checkLock, ping, restoreFrom } from './views/more.js';

const local = createLocalBook(); local.prefix = '';
const ctx = {
  local, preview: !!CFG.preview,
  ui: { period: 'all', custom: ['', ''], rPeriod: 'month', rCustom: ['', ''], rAcc: '', q: '', dq: '' },
  route: { name: 'home' },
  book() { return ctx.route.book || local; },
  go(path) { const want = path ? '#' + path : ''; if (location.hash === want || (!want && (location.hash === '' || location.hash === '#'))) render(); else location.hash = path; },
  render: () => render(),
  errorText: e => onlineError(e)
};
local.onError(() => toast(T('சேமிக்க முடியவில்லை. இடம் குறைவாக இருக்கலாம்.', 'Could not save. Storage may be full.')));

function parseRoute() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/^acc\//, 'acc-');
  const r = { name: 'home', book: null };
  let rest = h;
  if (/^g-[0-9a-f-]{36}/i.test(h)) {
    r.gid = h.slice(2, 38); rest = h.slice(39);
    r.book = groupBook(ctx, r.gid);
    if (!r.book) { r.name = signedIn() ? 'loading' : 'online'; return r; }
    r.group = true;
  } else if (h === 'online') { r.name = 'online'; return r; }
  else if (h === 'more') { r.name = 'more'; return r; }
  const book = r.book || local;
  if (rest === '' ) r.name = 'home';
  else if (rest === 'report') r.name = 'report';
  else if (rest === 'team' && r.group) r.name = 'team';
  else if (rest === 'details') r.name = 'details';
  else if (rest.startsWith('details-')) { r.name = 'details'; r.rid = fromSafeId(rest.slice(8)); }
  else if (rest.startsWith('acc-')) { const a = book.account(fromSafeId(rest.slice(4))); if (a) { r.name = 'acc'; r.acc = a; } }
  return r;
}

function render() {
  document.documentElement.lang = lang();
  const r = parseRoute(); ctx.route = r;
  const book = r.book || local;
  let html = '';
  if (r.name === 'home') html = viewHome(ctx, book);
  else if (r.name === 'acc') html = viewAccount(ctx, book, r.acc);
  else if (r.name === 'report') html = viewReport(ctx, book);
  else if (r.name === 'details') html = viewDetails(ctx, book, r.rid);
  else if (r.name === 'online') html = viewOnline(ctx);
  else if (r.name === 'team') html = viewTeam(ctx, book);
  else if (r.name === 'more') html = viewMore(ctx);
  else html = `<div class="topbar"><button class="icon-btn" data-go="online">${ic('back')}</button><h1>${T('குழு திறக்கிறது…', 'Opening group…')}</h1></div><div class="loader"><span></span></div>`;
  const actions = (r.name === 'home' || r.name === 'acc') && book.canEdit && !(r.acc && r.acc.locked);
  const tab = r.group || r.name === 'online' || r.name === 'loading' || r.name === 'team' ? 'online' : r.name === 'acc' ? 'home' : r.name;
  const markup = `<div class="screen ${actions ? '' : 'no-actions'} ${r.group ? 'is-group' : ''} fade-in" data-view="${r.name}">${html}</div>${dock(r, tab, actions)}`;
  if (!patchKeepingFocus(markup, r.name)) $('#app').innerHTML = markup;
  if (r.name === 'online') bindOnlineForms(ctx);
  if (r.name === 'details') bindDetailsForms(ctx, book);
  const q = $(ctx.ui.focusField || '#q'); if (q && ctx.ui.focusSearch) { q.focus(); try { q.setSelectionRange(q.value.length, q.value.length); } catch (e) { } ctx.ui.focusSearch = false; }
}
/* Re-render without destroying the field the user is typing in (a destroyed field closes the phone keyboard). */
function patchKeepingFocus(markup, view) {
  const app = $('#app'), act = document.activeElement, old = app.querySelector('.screen');
  if (!old || !act || !act.id || !/INPUT|TEXTAREA/.test(act.tagName) || !old.contains(act) || old.dataset.view !== view) return false;
  const tpl = document.createElement('div'); tpl.innerHTML = markup;
  const ns = tpl.querySelector('.screen'), has = c => c.id === act.id || !!c.querySelector('#' + CSS.escape(act.id));
  const keep = [...old.children].find(has), kids = [...ns.children], at = kids.findIndex(has);
  if (!keep || at < 0) return false;
  for (const c of [...old.children]) if (c !== keep) c.remove();
  kids.forEach((c, i) => { if (i < at) old.insertBefore(c, keep); else if (i > at) old.appendChild(c); });
  old.className = ns.className.replace('fade-in', '');
  const d = app.querySelector('.dock'), nd = tpl.querySelector('.dock'); if (d && nd) d.replaceWith(nd);
  return true;
}
function dock(r, tab, actions) {
  const acc = r.acc ? r.acc.id : '';
  const tabs = [['', 'home', T('முகப்பு', 'Home'), 'home'], ['report', 'chart', T('அறிக்கை', 'Report'), 'report'], ['online', 'users', T('குழு', 'Group'), 'online'], ['details', 'card', T('விவரங்கள்', 'Details'), 'details'], ['more', 'more', T('மேலும்', 'More'), 'more']];
  return `<nav class="dock">
    ${actions ? `<div class="actions">
      <button class="act in" data-act="new-entry" data-dir="1" data-acc="${acc}"><span class="sign">${ic('plus', 20, 3)}</span>${T('வரவு', 'Money In')}</button>
      <button class="act out" data-act="new-entry" data-dir="-1" data-acc="${acc}"><span class="sign">${ic('minus', 20, 3)}</span>${T('செலவு', 'Money Out')}</button>
    </div>` : ''}
    <div class="tabs" role="tablist">${tabs.map(([go, icon, label, key]) => `<button class="tab tab-${key} ${tab === key ? 'on' : ''}" data-go="${go}" role="tab" aria-selected="${tab === key}">${ic(icon)}<span>${label}</span></button>`).join('')}</div></nav>`;
}

/* ---------- events ---------- */
const ACTIONS = Object.assign({}, ledgerActions, detailsActions, onlineActions, moreActions, {
  'sheet-close': () => closeSheet()
});
window.addEventListener('hashchange', () => { closeSheet(true); render(); window.scrollTo(0, 0); });
document.addEventListener('click', async ev => {
  online.lastActivity = Date.now();
  const g = ev.target.closest('[data-go]');
  if (g) { if (ev.target.closest('.sheet')) closeSheet(true); ctx.go(g.dataset.go); return; }
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const fn = ACTIONS[b.dataset.act]; if (!fn) return;
  try { await fn(ctx, b); } catch (e) { console.error(e); toast(onlineError(e)); }
});
document.addEventListener('input', ev => {
  const id = ev.target.id;
  if (id === 'q' || id === 'dq') { ctx.ui[id] = ev.target.value; render(); }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset && t.dataset.act === 'custom') { const arr = t.dataset.for === 'acc' ? ctx.ui.custom : ctx.ui.rCustom; arr[Number(t.dataset.i)] = t.value; render(); }
});
document.addEventListener('keydown', ev => {
  online.lastActivity = Date.now();
  if (ev.key === 'Escape') { window.closeLedgerPanel(); return; }
  if (sheetOpen() && sheetState && sheetState.entryKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    const k = ev.key === 'Backspace' ? '⌫' : ev.key === 'Enter' ? 'ok' : ev.key;
    if (/^[0-9.+]$/.test(k) || k === '⌫' || k === 'ok') { ev.preventDefault(); sheetState.entryKey(k); }
  }
});
/* Android back button. Returns true when the app handled it. */
window.closeLedgerPanel = () => {
  if (document.querySelector('.lock')) return true;
  if (sheetOpen()) { closeSheet(); return true; }
  const r = ctx.route;
  if (r.name === 'acc' || r.name === 'report' || r.name === 'team' || (r.name === 'details' && (r.rid || r.group))) { history.length > 1 ? history.back() : ctx.go(''); return true; }
  if (r.group) { ctx.go('online'); return true; }
  if (r.name !== 'home') { ctx.go(''); return true; }
  if (ctx.ui.searchOpen) { ctx.ui.searchOpen = false; ctx.ui.q = ''; render(); return true; }
  return false;
};
window.applyAppLanguage = v => { setLang(v); render(); };
window.groupAuthLink = url => handleAuthLink(ctx, url);
window.restoreLedger = text => restoreFrom(ctx, text);
setInterval(() => idleCheck(ctx), 30000);

/* ---------- start ---------- */
async function start() {
  /* Phone keyboard: keep bottom sheets above it and the field being typed in visible. */
  const vv = window.visualViewport;
  if (vv) { const upd = () => { const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop), st = document.documentElement.style; st.setProperty('--kb', (kb > 80 ? kb : 0) + 'px'); st.setProperty('--vvh', vv.height + 'px'); }; vv.addEventListener('resize', upd); vv.addEventListener('scroll', upd); upd(); }
  document.addEventListener('focusin', e => { const t = e.target; if (t && t.closest && t.closest('.sheet .body') && /INPUT|TEXTAREA/.test(t.tagName)) setTimeout(() => { try { t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (x) { } }, 350); });
  hardenInputs(document.body);
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) hardenInputs(n); }).observe(document.body, { childList: true, subtree: true });
  setLang(lang()); applyTheme();
  if (window.matchMedia) { const m = matchMedia('(prefers-color-scheme: dark)'); m.addEventListener && m.addEventListener('change', () => render()); }
  await local.load();
  render();
  const s = $('#splash'); if (s) { s.classList.add('out'); setTimeout(() => s.remove(), 700); }
  if (!local.storageOk) toast(T('இந்த உலாவியில் சேமிப்பு இல்லை. Private mode-ஐ நிறுத்தவும்.', 'Storage is unavailable. Turn off private mode.'));
  checkLock();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !native.any && !ctx.preview) {
    /* Auto update: a new release is fetched in the background and the app reloads itself once it is safe. */
    const hadController = !!navigator.serviceWorker.controller; let reloading = false;
    const safeReload = () => { if (reloading) return; if (sheetOpen() || document.querySelector('.lock') || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { setTimeout(safeReload, 4000); return; } reloading = true; location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) safeReload(); });
    navigator.serviceWorker.register('sw.js').then(reg => {
      const check = () => reg.update().catch(() => { });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      setInterval(check, 30 * 60 * 1000);
    }).catch(() => { });
  }
  const u = new URL(location.href); if (u.searchParams.has('code')) { const link = location.href; history.replaceState(null, '', location.pathname + location.hash); handleAuthLink(ctx, link); }
  setTimeout(() => ping(ctx), 2500);
}
window.TL = { ctx, render, online, version: VERSION };
start();
