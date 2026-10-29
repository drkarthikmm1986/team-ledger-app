/* More: language, look, lock, backup, help, rating, about. */
import { $, esc, T, TP, ic, LOGO, ls, lang, setLang, LANGS, VERSION, CFG, today, addDays, niceDate, ymd, uid, platform } from '../core/util.js';
import { calcProfit } from '../core/ledger.js';
import { toast, openSheet, closeSheet, confirmBox, pinPad, saveFile, readTextFile, shareText } from '../ui/kit.js';
import { makeBackup, parseBackup, applyBackup } from '../data/backup.js';
import { filesClear } from '../data/db.js';
import { emptyLedger } from '../data/local-book.js';
import { helpSteps } from './ledger.js';
import { lockAll } from './details.js';

export function applyTheme() {
  const t = ls.get('tl4-theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}
export function viewMore(ctx) {
  const theme = ls.get('tl4-theme', 'auto'), lockOn = !!ls.get('tl4-pin', ''), last = Number(ls.get('tl4-last-backup', '0')), stats = ls.get('tl4-stats', 'on') === 'on';
  return `<div class="topbar"><span class="logo">${LOGO}</span><h1>${T('மேலும்', 'More')}</h1></div>
    <div class="menu">
      <button class="row" data-act="lang-pick"><span class="ic">${ic('lang')}</span><span class="tx"><b>${T('மொழி', 'Language')}</b><small>${esc((LANGS.find(l => l[0] === lang()) || LANGS[0])[1])}</small></span><span class="end">${ic('chev', 18)}</span></button>
      <div class="row"><span class="ic">${ic('sun')}</span><span class="tx"><b>${T('தோற்றம்', 'Look')}</b></span>
        <span class="seg"><button class="${theme === 'auto' ? 'on' : ''}" data-act="theme" data-v="auto">${T('தானாக', 'Auto')}</button><button class="${theme === 'light' ? 'on' : ''}" data-act="theme" data-v="light" aria-label="light">☀</button><button class="${theme === 'dark' ? 'on' : ''}" data-act="theme" data-v="dark" aria-label="dark">☾</button></span></div>
      <label class="row"><span class="ic">${ic('cal')}</span><span class="tx"><b>${T('பதிவுகளில் நேரம் காட்டு', 'Show time on entries')}</b><small>${T('தேதி மட்டும் போதுமென்றால் டிக் எடுக்கவும்', 'Leave it off to show only the date')}</small></span><input type="checkbox" class="check24" data-act="show-time" ${ls.get('tl4-show-time', '') === '1' ? 'checked' : ''}></label>
      <button class="row" data-act="lock"><span class="ic">${ic('lock')}</span><span class="tx"><b>${T('ஆப் பூட்டு', 'App lock')}</b><small>${T('4 இலக்க PIN — ஆப் திறக்கும்போது கேட்கும்', '4-digit PIN when the app opens')}</small></span><span class="end">${lockOn ? T('இயக்கம்', 'ON') : T('இல்லை', 'OFF')}</span></button>
    </div>
    ${ctx.preview && CFG.apkZip ? `<div class="section-h"><h2>${T('Android ஆப்', 'Android app')}</h2></div><div class="menu"><button class="row" data-act="get-apk"><span class="ic green">${ic('save')}</span><span class="tx"><b>${T('Android ஆப் பதிவிறக்கு (ZIP)', 'Download Android app (ZIP)')}</b><small>${T('ZIP-ஐ Files-ல் திறந்து Extract → APK → Install. குழுக் கணக்கு, PDF உட்பட எல்லாம்.', 'Open the ZIP in Files → Extract → APK → Install. Includes Online groups and PDF.')}</small></span></button></div>` : ''}
    <div class="section-h"><h2>${T('பாதுகாப்பு நகல் (Backup)', 'Backup')}</h2></div>
    <div class="menu">
      <button class="row" data-act="backup"><span class="ic green">${ic('save')}</span><span class="tx"><b>${T('Backup சேமி', 'Save backup')}</b><small>${last ? T('கடைசியாக: ', 'Last: ') + niceDate(ymd(new Date(last))) : T('இதுவரை எடுக்கவில்லை', 'Never saved')} · ${T('கணக்கு விவரங்களும் சேரும் (பூட்டுடன்)', 'Includes Account Details (locked)')}</small></span></button>
      <button class="row" data-act="restore"><span class="ic">${ic('upload')}</span><span class="tx"><b>${T('Backup-ஐ ஏற்று', 'Restore backup')}</b><small>${T('பழைய Team Ledger Backup-உம் வேலை செய்யும்', 'Old Team Ledger backups work too')}</small></span></button>
    </div>
    <div class="section-h"><h2>${T('உதவி', 'Help')}</h2></div>
    <div class="menu">
      <button class="row" data-act="help"><span class="ic">${ic('help')}</span><span class="tx"><b>${T('எப்படிப் பயன்படுத்துவது', 'How to use')}</b></span></button>
      <button class="row" data-act="rate"><span class="ic amber">${ic('star')}</span><span class="tx"><b>${T('மதிப்பீடு & கருத்து', 'Rate & feedback')}</b><small>${T('உங்கள் கருத்து ஆப்பை மேம்படுத்தும்', 'Help us improve the app')}</small></span></button>
      ${CFG.shareUrl ? `<button class="row" data-act="share-app"><span class="ic">${ic('share')}</span><span class="tx"><b>${T('நண்பர்களுடன் பகிர்', 'Share with friends')}</b></span></button>` : ''}
      ${CFG.supabaseUrl && !ctx.preview ? `<button class="row" data-act="stats"><span class="ic">${ic('info')}</span><span class="tx"><b>${T('பெயரில்லா பயன்பாட்டு எண்ணிக்கை', 'Anonymous usage count')}</b><small>${T('எத்தனை பேர் பயன்படுத்துகிறார்கள் என்பதை மட்டும் எண்ணும். கணக்கு விவரம் எதுவும் அனுப்பப்படாது.', 'Only counts how many people use the app. None of your records are sent.')}</small></span><span class="end">${stats ? T('இயக்கம்', 'ON') : T('இல்லை', 'OFF')}</span></button>` : ''}
    </div>
    ${true ? `<div class="section-h"><h2>${T('புதுப்பிப்பு', 'Updates')}</h2></div>
    <div class="menu">
      <button class="row" data-act="check-update"><span class="ic green">${ic('refresh')}</span><span class="tx"><b>${T('புதிய பதிப்பு உள்ளதா பார்', 'Check for updates')}</b><small>${T('இப்போது: ', 'Now: ')}${VERSION} · ${T('புதிய பதிப்பு வந்தால் தானாகவே சொல்லும்', 'You are told automatically when a new version arrives')}</small></span></button>
    </div>` : ''}
    <div class="section-h"><h2>${T('மற்றவை', 'Other')}</h2></div>
    <div class="menu">
      ${ctx.local.demo ? `<button class="row" data-act="clear-demo"><span class="ic amber">${ic('spark')}</span><span class="tx"><b>${T('மாதிரி தரவை நீக்கு', 'Remove demo data')}</b></span></button>` : ''}
      <button class="row" data-act="wipe"><span class="ic red">${ic('trash')}</span><span class="tx"><b>${T('எல்லா தரவையும் அழி', 'Erase all data')}</b><small>${T('முதலில் Backup எடுக்கவும்', 'Save a backup first')}</small></span></button>
    </div>
    <p class="note center mt22">Team Ledger ${VERSION} · ${T('இணையம் இல்லாமலும் வேலை செய்யும்', 'Works without internet')}<br>${T('உங்கள் கணக்குகள் இந்த போனில் மட்டும் சேமிக்கப்படும்', 'Your records stay on this device')}</p>`;
}

/* ---------- lock ---------- */
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function checkLock() {
  const h = ls.get('tl4-pin', ''); if (!h) return;
  pinPad(T('PIN அடிக்கவும்', 'Enter PIN'), 'Team Ledger', async p => (await sha('tl4:' + p)) === h);
}
function toggleLock(ctx) {
  if (ls.get('tl4-pin', '')) {
    pinPad(T('இப்போதைய PIN', 'Current PIN'), T('பூட்டை நிறுத்த', 'To turn off the lock'), async p => { if ((await sha('tl4:' + p)) !== ls.get('tl4-pin', '')) return false; ls.del('tl4-pin'); ctx.render(); toast(T('பூட்டு நிறுத்தப்பட்டது', 'Lock turned off')); });
  } else {
    pinPad(T('புதிய PIN', 'New PIN'), T('4 இலக்கம் — நினைவில் வைக்கவும்', '4 digits — remember it'), async first => {
      pinPad(T('மீண்டும் அடிக்கவும்', 'Type again'), T('உறுதிப்படுத்த', 'To confirm'), async p2 => { if (p2 !== first) { toast(T('PIN பொருந்தவில்லை', 'PINs do not match')); return; } ls.set('tl4-pin', await sha('tl4:' + p2)); ctx.render(); toast(T('பூட்டு இயக்கப்பட்டது 🔒', 'Lock is on 🔒')); });
    });
  }
}

/* ---------- backup ---------- */
async function doBackup(ctx) {
  const b = await makeBackup(ctx.local);
  if (await saveFile(b.name, b.text, 'application/json')) { ls.set('tl4-last-backup', String(Date.now())); ctx.render(); toast(T('Backup தயார்: ', 'Backup ready: ') + b.name); }
}
export async function restoreFrom(ctx, text) {
  let parsed;
  try { parsed = parseBackup(text); } catch (e) { toast(T('இந்த Backup-ஐப் படிக்க முடியவில்லை', 'Could not read this backup')); return; }
  const r = parsed.report;
  const msg = parsed.old
    ? TP('பழைய ஆப்பிலிருந்து {a} கணக்குகள், {e} பதிவுகள், {f} இணைப்புகள் கிடைத்தன.', 'Found {a} accounts, {e} entries and {f} attachments from the old app.', { a: r.accounts, e: r.entries, f: r.files }) + (parsed.hasVault ? ' ' + T('கணக்கு விவரங்களும் உள்ளன (பழைய கடவுச்சொல்லால் திறக்கலாம்).', 'Account Details included (open with your old password).') : '')
    : TP('{a} கணக்குகள், {e} பதிவுகள்.', '{a} accounts, {e} entries.', { a: parsed.ledger.accounts.length, e: parsed.ledger.entries.length });
  const hasData = ctx.local.accounts.length > 0 && !ctx.local.demo;
  openSheet(T('Backup-ஐ ஏற்று', 'Restore backup'), `<p class="lead-text">${esc(msg)}</p>${hasData ? `<p class="note">${T('இப்போது உள்ள பதிவுகளுடன் சேர்க்கலாம், அல்லது முழுவதும் மாற்றலாம்.', 'You can add to your current records or replace them.')}</p>` : ''}`,
    hasData ? `<button class="btn ghost" id="r-merge">${T('சேர்', 'Add')}</button><button class="btn" id="r-replace">${T('மாற்று', 'Replace')}</button>` : `<button class="btn block" id="r-replace">${ic('check', 20, 3)}${T('ஏற்று', 'Restore')}</button>`);
  const go = async mode => { await applyBackup(ctx.local, parsed, mode); lockAll(); closeSheet(true); ctx.go(''); toast(T('Backup ஏற்றப்பட்டது ✓', 'Backup restored ✓')); };
  $('#r-replace').onclick = () => go('replace');
  if ($('#r-merge')) $('#r-merge').onclick = () => go('merge');
}

/* ---------- rating & usage ---------- */
const installId = () => { let i = ls.get('tl4-install', ''); if (!i) { i = uid(); ls.set('tl4-install', i); } return i; };
function api(path, body) {
  if (!CFG.supabaseUrl || !CFG.supabaseKey) return Promise.reject(Error('no-config'));
  return fetch(CFG.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, { method: 'POST', headers: { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body), keepalive: true })
    .then(r => { if (!r.ok && r.status !== 409) throw Error('http ' + r.status); });
}
export function ping(ctx) {
  if (ctx.preview || ls.get('tl4-stats', 'on') !== 'on' || !CFG.supabaseUrl) return;
  const d = today(); if (ls.get('tl4-ping', '') === d) return;
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  api('tl_pings', { install_id: installId(), day: d, platform: platform(), version: VERSION, lang: lang(), installed: !!(platform() === 'android-app' || standalone) }).then(() => ls.set('tl4-ping', d)).catch(() => { });
  const q = JSON.parse(ls.get('tl4-review-queue', '[]')); if (q.length) Promise.all(q.map(b => api('tl_reviews', b))).then(() => ls.del('tl4-review-queue')).catch(() => { });
}
function rateSheet(ctx) {
  let stars = Number(ls.get('tl4-my-stars', '0')) || 0;
  const draw = () => `<p class="center">${T('Team Ledger எப்படி இருக்கிறது?', 'How do you like Team Ledger?')}</p>
    <div class="stars">${[1, 2, 3, 4, 5].map(i => `<button data-s="${i}" class="${i <= stars ? 'on' : ''}" aria-label="${i}">${ic('star', 36, 1.6).replace('fill="none"', i <= stars ? 'fill="currentColor"' : 'fill="none"')}</button>`).join('')}</div>
    <div class="field"><label for="fb">${T('உங்கள் கருத்து (விருப்பம்)', 'Your feedback (optional)')}</label><textarea class="input" id="fb" maxlength="1000" placeholder="${T('எது பிடித்தது? எதை மாற்றலாம்?', 'What do you like? What should change?')}"></textarea></div>
    <div class="field"><label for="fbn">${T('பெயர் / ஊர் (விருப்பம்)', 'Name / town (optional)')}</label><input class="input" id="fbn" maxlength="60"></div>
    <p class="note">${T('உங்கள் கணக்கு விவரங்கள் எதுவும் அனுப்பப்படாது.', 'None of your records are sent.')}</p>`;
  const sh = openSheet(T('மதிப்பீடு', 'Rate the app'), draw(), `<button class="btn block" id="fb-send">${ic('check', 20, 3)}${T('அனுப்பு', 'Send')}</button>`);
  sh.querySelector('.body').addEventListener('click', ev => {
    const b = ev.target.closest('[data-s]'); if (!b) return;
    const fb = $('#fb').value, fbn = $('#fbn').value; stars = Number(b.dataset.s);
    sh.querySelector('.body').innerHTML = draw(); $('#fb').value = fb; $('#fbn').value = fbn;
  });
  $('#fb-send').onclick = async () => {
    if (!stars) { toast(T('நட்சத்திரத்தைத் தேர்ந்தெடுக்கவும்', 'Please choose stars')); return; }
    const body = { install_id: installId(), stars, text: $('#fb').value.trim().slice(0, 1000), name: $('#fbn').value.trim().slice(0, 60), platform: platform(), version: VERSION, lang: lang() };
    ls.set('tl4-my-stars', String(stars));
    try { if (ctx.preview) throw Error('preview'); await api('tl_reviews', body); closeSheet(); toast(T('நன்றி! 🙏', 'Thank you! 🙏')); }
    catch (e) { const q = JSON.parse(ls.get('tl4-review-queue', '[]')); q.push(body); ls.set('tl4-review-queue', JSON.stringify(q.slice(-5))); closeSheet(); toast(T('நன்றி! இணையம் வந்ததும் அனுப்பப்படும் 🙏', 'Thank you! It will be sent when online 🙏')); }
  };
}

/* ---------- demo data ---------- */
function loadDemo(ctx) {
  const t = today(), A = (n, o, r) => ({ id: uid(), name: n, phone: '', opening: o, rate: r || 0, commRate: 0, note: '', created: Date.now() });
  const shop = A(T('கடை', 'Shop'), 500000), ravi = A(T('ரவி', 'Ravi'), 0, 200), home = A(T('வீட்டுச் செலவு', 'Home expenses'), 0);
  const E = (a, dir, rs, d, note, time) => { const amt = rs * 100, pr = calcProfit(a, amt, null, null); return { id: uid(), acc: a.id, dir, amt, date: addDays(t, -d), time: time || '10:00', note, party: '', cat: '', rate: null, commRate: null, profit: pr.profit, comm: pr.comm, files: [], created: Date.now() - d * 1e5 }; };
  ctx.local.replace({
    app: 'team-ledger', version: 1, demo: true, created: Date.now(), accounts: [shop, ravi, home], entries: [
      E(shop, 1, 4200, 0, T('விற்பனை', 'Sales'), '18:30'), E(shop, -1, 1500, 0, T('சரக்கு', 'Stock'), '11:15'), E(shop, 1, 3650, 1, T('விற்பனை', 'Sales'), '19:00'),
      E(shop, -1, 800, 1, T('மின் கட்டணம்', 'Electricity'), '12:00'), E(shop, 1, 5100, 3, T('விற்பனை', 'Sales'), '19:10'), E(shop, -1, 2400, 4, T('சரக்கு', 'Stock'), '10:20'),
      E(ravi, -1, 20000, 9, T('கடன் கொடுத்தது', 'Loan given'), '09:30'), E(ravi, 1, 5000, 2, T('திரும்ப வந்தது', 'Returned'), '17:45'),
      E(home, -1, 1200, 0, T('காய்கறி', 'Vegetables'), '08:10'), E(home, -1, 450, 2, T('பால்', 'Milk'), '07:00'), E(home, -1, 6000, 6, T('வாடகை', 'Rent'), '10:00'), E(home, 1, 25000, 8, T('சம்பளம்', 'Salary'), '10:00')
    ]
  });
  ctx.render(); toast(T('மாதிரி தரவு ஏற்றப்பட்டது. மேலும் → நீக்கலாம்.', 'Demo loaded. Remove it any time from More.'));
}

export const moreActions = {
  'check-update': async ctx => {
    if (window.LedgerUpdates && window.LedgerUpdates.check) { window.LedgerUpdates.check(); return; }
    if (ctx.preview) { toast(TP('இந்த link எப்போதும் சமீபத்திய பதிப்பைத் திறக்கும் ({v})', 'This link always opens the latest version ({v})', { v: VERSION })); return; }
    if (window.TL && window.TL.updateReady) { location.reload(); return; }
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.update(); if (reg.installing || reg.waiting) { toast(T('புதிய பதிப்பு ஏற்றுகிறது…', 'Loading the new version…')); return; } }
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const v = r.ok ? (await r.json()).version : VERSION;
      toast(v && v !== VERSION ? TP('புதிய பதிப்பு {v} — மீண்டும் திறக்கவும்', 'Version {v} ready — reopen the app', { v }) : T('சமீபத்திய பதிப்பு உள்ளது', 'You have the latest version'));
    } catch (e) { toast(T('இணையத்துடன் மீண்டும் முயற்சிக்கவும்', 'Try again with internet')); }
  },
  'lang-pick': () => openSheet(T('மொழி', 'Language'), `<div class="lang-grid">${LANGS.map(([c, n, e]) => `<button class="lang-opt ${c === lang() ? 'on' : ''}" data-act="lang" data-v="${c}" lang="${c}"><b>${esc(n)}</b><small>${esc(e)}</small></button>`).join('')}</div>`),
  lang: async (ctx, b) => { closeSheet(true); await setLang(b.dataset.v); ctx.render(); },
  'show-time': (ctx, b) => { ls.set('tl4-show-time', b.checked ? '1' : ''); ctx.render(); },
  theme: (ctx, b) => { ls.set('tl4-theme', b.dataset.v); applyTheme(); ctx.render(); },
  lock: ctx => toggleLock(ctx),
  backup: ctx => doBackup(ctx),
  restore: async ctx => { const t = await readTextFile(); if (t) restoreFrom(ctx, t); },
  help: () => openSheet(T('எப்படிப் பயன்படுத்துவது', 'How to use'), helpSteps() + `<div class="steps mt10">
      <div class="step"><span class="n">+</span><div><b>${T('பல தொகைகளைக் கூட்டலாம்', 'Add many amounts')}</b><p>${T('உதா: 120 + 80 + 45 என்று அடித்தால் 245 ஆகும்.', 'e.g. type 120 + 80 + 45 to get 245.')}</p></div></div>
      <div class="step"><span class="n blue-bg">${ic('users', 18)}</span><div><b>${T('குழுக் கணக்கு', 'Group book')}</b><p>${T('குழு → உள்நுழை → குழுவை உருவாக்கு → உறுப்பினர்களை அழை.', 'Group → Sign in → Create a group → Invite members.')}</p></div></div>
      <div class="step"><span class="n violet-bg">${ic('card', 18)}</span><div><b>${T('கணக்கு விவரங்கள்', 'Account Details')}</b><p>${T('வங்கி, UPI, ATM அட்டை, PAN, ஆதார் — பூட்டுடன் சேமிக்கலாம்.', 'Save bank, UPI, ATM card, PAN, Aadhaar — locked.')}</p></div></div>
      <div class="step"><span class="n">${ic('save', 18)}</span><div><b>${T('வாரம் ஒருமுறை Backup', 'Backup once a week')}</b><p>${T('மேலும் → Backup சேமி. அதை WhatsApp அல்லது Drive-ல் வைத்துக்கொள்ளுங்கள்.', 'More → Save backup. Keep it in WhatsApp or Drive.')}</p></div></div></div>`),
  rate: ctx => rateSheet(ctx),
  'get-apk': async () => {
    toast(T('தயாராகிறது…', 'Preparing…'));
    try {
      const m = await import('../apk-zip.js'); const bin = Uint8Array.from(atob(m.default), c => c.charCodeAt(0));
      const blob = new Blob([bin], { type: 'application/zip' });
      if (window.TL_DOWNLOADS) await window.TL_DOWNLOADS.save({ filename: 'Team-Ledger-' + VERSION + '-Android.zip', data: blob });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Team-Ledger-' + VERSION + '-Android.zip'; a.click(); }
    } catch (e) { toast(e && e.code === 'declined' ? T('ரத்து செய்யப்பட்டது', 'Cancelled') : T('பதிவிறக்க முடியவில்லை', 'Could not download')); }
  },
  'share-app': () => shareText(T('Team Ledger — எளிய வரவு செலவு கணக்கு ஆப். இலவசம்: ', 'Team Ledger — simple money book app. Free: ') + CFG.shareUrl),
  stats: ctx => { ls.set('tl4-stats', ls.get('tl4-stats', 'on') === 'on' ? 'off' : 'on'); ctx.render(); },
  demo: ctx => loadDemo(ctx),
  'clear-demo': async ctx => { ctx.local.replace(emptyLedger()); await ctx.local.flush(); ctx.go(''); },
  wipe: async ctx => {
    if (!await confirmBox(T('எல்லாவற்றையும் அழிக்கவா?', 'Erase everything?'), T('எல்லா கணக்குகளும் பதிவுகளும் கணக்கு விவரங்களும் இந்த போனிலிருந்து நீக்கப்படும். திரும்பப் பெற முடியாது.', 'All accounts, entries and Account Details will be removed from this device. This cannot be undone.'), T('அழி', 'Erase'), true)) return;
    ctx.local.replace(emptyLedger()); await ctx.local.flush(); await filesClear().catch(() => { }); lockAll(); ctx.go(''); toast(T('அழிக்கப்பட்டது', 'Erased'));
  }
};
