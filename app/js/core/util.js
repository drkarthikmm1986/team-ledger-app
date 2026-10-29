/* Shared helpers: DOM, storage, language, money, dates, icons, native bridges. */
export const VERSION = '4.2.1';
export const CFG = (typeof window !== 'undefined' && window.TL_CONFIG) || {};
export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uuid = () => crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
export const uid = () => uuid();
export const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};

/* ---------- native bridges (Android shell) ---------- */
const W = typeof window !== 'undefined' ? window : {};
export const native = {
  get android() { return W.Android || null; },
  get any() { return !!(W.Android || W.LedgerDownloads); },
  canSave: () => !!((W.LedgerDownloads && W.LedgerDownloads.saveText) || (W.Android && W.Android.saveText)),
  save(name, text, mime) {
    if (W.LedgerDownloads && W.LedgerDownloads.saveText) { W.LedgerDownloads.saveText(name, text, mime === 'application/json' ? mime : 'text/plain'); return true; }
    if (W.Android && W.Android.saveText) { W.Android.saveText(name, text, mime); return true; }
    return false;
  },
  print(name) { if (W.Android && W.Android.printReport) { W.Android.printReport(name); return true; } return false; },
  share(text) { if (W.Android && W.Android.shareAccountText) { W.Android.shareAccountText(text); return true; } return false; },
  copy(text) {
    if (W.Android && W.Android.copyAccountText) { W.Android.copyAccountText(text); return true; }
    if (W.Android && W.Android.copyText && text.length <= 4096) { W.Android.copyText(text); return true; }
    return false;
  },
  open(id, name, mime, data) { if (W.Android && W.Android.openAttachment) { W.Android.openAttachment(String(id).replace(/[^A-Za-z0-9-]/g, '').slice(0, 100) || 'file', name, mime, data); return true; } return false; },
  get lock() { return W.Android && W.Android.setAppLock ? W.Android : null; }
};

/* ---------- language ----------
   Tamil and English are written inline: T('தமிழ்', 'English'). Every other language is a
   dictionary keyed by the English text (js/i18n/<code>.js), loaded before the first screen. */
export const LANGS = [
  ['ta', 'தமிழ்', 'Tamil'], ['en', 'English', 'English'], ['hi', 'हिन्दी', 'Hindi'], ['zh', '中文', 'Chinese'],
  ['es', 'Español', 'Spanish'], ['ar', 'العربية', 'Arabic'], ['fr', 'Français', 'French'], ['bn', 'বাংলা', 'Bengali'],
  ['pt', 'Português', 'Portuguese'], ['ru', 'Русский', 'Russian'], ['ur', 'اردو', 'Urdu'], ['id', 'Bahasa Indonesia', 'Indonesian'],
  ['de', 'Deutsch', 'German'], ['ja', '日本語', 'Japanese'], ['te', 'తెలుగు', 'Telugu']
];
const CODES = LANGS.map(l => l[0]), RTL = ['ar', 'ur'];
let LANG = ls.get('tl4-lang', '') || (W.Android && W.Android.getLanguage && W.Android.getLanguage()) || 'ta';
if (!CODES.includes(LANG)) LANG = 'ta';
let DICT = {};
export const lang = () => LANG;
export const isRTL = () => RTL.includes(LANG);
const applyDoc = () => { document.documentElement.lang = LANG; document.documentElement.dir = isRTL() ? 'rtl' : 'ltr'; };
/** Load the dictionary for the current language (no-op for Tamil / English). */
export async function loadLang() {
  DICT = {};
  if (LANG !== 'ta' && LANG !== 'en') { try { DICT = (await import(`../i18n/${LANG}.js`)).default || {}; } catch (e) { DICT = {}; } }
  applyDoc();
}
export async function setLang(v) {
  LANG = CODES.includes(v) ? v : 'ta'; ls.set('tl4-lang', LANG);
  try { W.Android && W.Android.setLanguage && W.Android.setLanguage(LANG === 'ta' ? 'ta' : 'en'); } catch (e) { }
  await loadLang();
}
export const tr = en => (LANG === 'en' || LANG === 'ta') ? en : (DICT[en] || en);
export const T = (ta, en) => LANG === 'ta' ? ta : LANG === 'en' ? en : (DICT[en] || (W.__TL_MISS && W.__TL_MISS.add(en), en));
/** Translation with {placeholders}: TP('{n} பதிவுகள்', '{n} entries', { n: 3 }) */
export const TP = (ta, en, vars) => T(ta, en).replace(/\{(\w+)\}/g, (m, k) => vars && vars[k] != null ? String(vars[k]) : m);
export const locale = () => ({ ta: 'ta-IN', en: 'en-IN', hi: 'hi-IN', zh: 'zh-CN', es: 'es-ES', ar: 'ar', fr: 'fr-FR', bn: 'bn-IN', pt: 'pt-BR', ru: 'ru-RU', ur: 'ur-PK', id: 'id-ID', de: 'de-DE', ja: 'ja-JP', te: 'te-IN' })[LANG] || 'en-IN';

/* ---------- money ---------- */
export const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmt = p => { const a = Math.abs(p || 0); return (a % 100 ? nf2 : nf).format(a / 100); }; // ₹12.50, not ₹12.5
export const money = p => (p < 0 ? '−' : '') + '₹' + fmt(p);
export const moneyAbs = p => '₹' + fmt(p);
export const toPaise = v => { const n = Number(String(v).replace(/,/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
export const pctToBp = v => { const s = String(v == null ? '' : v).trim(); if (s === '') return null; return Math.round(Math.min(100, Math.max(0, Number(s) || 0)) * 100); };

/* ---------- dates ---------- */
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const today = () => ymd(new Date());
export const nowTime = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const MON_TA = ['ஜன', 'பிப்', 'மார்', 'ஏப்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆக', 'செப்', 'அக்', 'நவ', 'டிச'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_X = {};
export const monName = m => {
  if (LANG === 'ta') return MON_TA[m]; if (LANG === 'en') return MON_EN[m];
  const k = LANG; if (!MON_X[k]) { try { const f = new Intl.DateTimeFormat(locale(), { month: 'short' }); MON_X[k] = MON_EN.map((x, i) => f.format(new Date(2024, i, 15))); } catch (e) { MON_X[k] = MON_EN; } }
  return MON_X[k][m];
};
export function niceDate(s) {
  if (!s) return '';
  if (s === today()) return T('இன்று', 'Today');
  if (s === addDays(today(), -1)) return T('நேற்று', 'Yesterday');
  const [y, m, d] = s.split('-').map(Number);
  return d + ' ' + monName(m - 1) + (y !== new Date().getFullYear() ? ' ' + y : '');
}
export function niceTime(t) {
  if (!t || t === '00:00') return '';
  let [h, m] = t.split(':').map(Number); const pm = h >= 12; h = h % 12 || 12;
  return h + ':' + pad(m) + ' ' + (pm ? 'PM' : 'AM');
}
export const dmy = s => s ? s.split('-').reverse().join('-') : '';
export function periodRange(key, custom) {
  const t = today(), d = new Date(t + 'T12:00:00');
  if (key === 'today') return [t, t];
  if (key === 'week') { const s = addDays(t, -((d.getDay() + 6) % 7)); return [s, addDays(s, 6)]; }
  if (key === 'month') return [t.slice(0, 8) + '01', ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  if (key === 'lastmonth') return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))];
  if (key === 'year') return [d.getFullYear() + '-01-01', d.getFullYear() + '-12-31'];
  if (key === 'custom' && custom) return [custom[0] || '', custom[1] || ''];
  return ['', ''];
}
export const PERIODS = () => [['all', T('எல்லாம்', 'All')], ['today', T('இன்று', 'Today')], ['week', T('இந்த வாரம்', 'This week')], ['month', T('இந்த மாதம்', 'This month')], ['lastmonth', T('போன மாதம்', 'Last month')], ['year', T('இந்த வருடம்', 'This year')], ['custom', T('தேதி தேர்வு', 'Pick dates')]];

/* ---------- avatars ---------- */
const PALETTE = ['#0e7c74', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#65a30d', '#c026d3', '#4f46e5', '#b45309'];
export function colorFor(name) { let h = 0; for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
export function initial(name) { const s = String(name || '?').trim(); const seg = W.Intl && Intl.Segmenter ? [...new Intl.Segmenter().segment(s)][0] : null; return (seg ? seg.segment : s[0] || '?').toUpperCase(); }
export const avatar = (name, cls) => `<span class="avatar ${cls || ''}" style="background:${colorFor(name)}">${esc(initial(name))}</span>`;

/* ---------- icons ---------- */
const P = {
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', back: 'm15 18-6-6 6-6', search: 'm21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z',
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  more: 'M4 6h16M4 12h16M4 18h16', dots: 'M12 6h.01M12 12h.01M12 18h.01', down: 'M12 5v14m-6-6 6 6 6-6', up: 'M12 19V5m-6 6 6-6 6 6',
  x: 'M18 6 6 18M6 6l12 12', check: 'm5 12 5 5 9-11', chev: 'm9 6 6 6-6 6',
  pdf: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6', share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2', save: 'M12 3v12m-5-5 5 5 5-5M5 21h14', upload: 'M12 21V9m-5 5 5-5 5 5M5 3h14',
  lang: 'M4 5h9M8 3v2m3 0c-1 5-4 8-7 9m3-5c1 2 3 4 6 5M13 21l4-9 4 9m-7-3h6',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.3l1-6.2L3 9.7l6.2-.9z', help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  clip: 'M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L15 7.5', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5', phone: 'M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2',
  excel: 'M4 4h16v16H4zM4 9h16M4 14h16M10 4v16', spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4', info: 'M12 16v-5M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7V6a2 2 0 0 1 2-2h11M16 13h.01',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4', bank: 'M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18',
  id: 'M4 5h16v14H4zM8 10a2 2 0 1 0 4 0 2 2 0 0 0-4 0M6.5 16a3.5 3.5 0 0 1 7 0M15 9h3M15 13h3',
  copy: 'M8 8h12v12H8zM4 16V4h12', eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeoff: 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-3 6h6M9 12h6m-4-3c2.5 0 2.5 6 0 6l3 3',
  cloud: 'M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z', refresh: 'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.7-1L20 9M4 15l2.2 3A7 7 0 0 0 17.9 17',
  login: 'M14 4h5v16h-5M3 12h12m-5-5 5 5-5 5', logout: 'M10 4H5v16h5M21 12H9m5-5-5 5 5 5', key: 'M15 7a4 4 0 1 1-3.9 5H8v3H5v-3H3v-3h8.1A4 4 0 0 1 15 7Z',
  chat: 'M4 5h16v11H8l-4 4z', shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01', mail: 'M3 6h18v12H3zM3 6l9 7 9-7'
};
export const ic = (n, s, w) => `<svg width="${s || 22}" height="${s || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 2.2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || P.info}"/></svg>`;
export const LOGO = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v14h12" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 13l7-7m-5 0h5v5" fill="none" stroke="#7ff0dc" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------- base64 ---------- */
export function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); }
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const platform = () => native.any ? 'android-app' : isIOS() ? 'ios-web' : /Android/.test(navigator.userAgent) ? 'android-web' : 'web';
