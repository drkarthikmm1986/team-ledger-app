/* Reusable UI parts: toast, bottom sheet, confirm, PIN pad, files, share, copy. */
import { $, esc, T, ic, LOGO, native, isIOS, uuid } from '../core/util.js';

let toastTimer;
export function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.fn(); };
  el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5500 : 2600);
}

/* ---------- bottom sheet ---------- */
export let sheetState = null;
export function openSheet(title, body, footer, opts) {
  closeSheet(true);
  const root = $('#sheet-root');
  root.innerHTML = `<div class="scrim" data-act="sheet-close"></div><section class="sheet ${opts && opts.tall ? 'tall' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div>
    <header><h3>${esc(title)}</h3><button class="icon-btn" data-act="sheet-close" aria-label="${T('மூடு', 'Close')}">${ic('x')}</button></header>
    <div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</section>`;
  sheetState = Object.assign({}, opts || {});
  requestAnimationFrame(() => { const s = root.querySelector('.sheet'), sc = root.querySelector('.scrim'); s && s.classList.add('show'); sc && sc.classList.add('show'); });
  return root.querySelector('.sheet');
}
export function closeSheet(instant) {
  const root = $('#sheet-root'); if (!root || !root.firstChild) return false;
  const st = sheetState; sheetState = null;
  if (instant) root.innerHTML = '';
  else {
    const s = root.querySelector('.sheet'), sc = root.querySelector('.scrim');
    s && s.classList.remove('show'); sc && sc.classList.remove('show');
    setTimeout(() => { if (!sheetState) root.innerHTML = ''; }, 230);
  }
  if (st && st.onClose) st.onClose();
  return true;
}
export const sheetOpen = () => !!($('#sheet-root') && $('#sheet-root').firstChild);
export function confirmBox(title, msg, okLabel, danger) {
  return new Promise(res => {
    let done = false;
    openSheet(title, `<p class="lead-text">${esc(msg)}</p>`,
      `<button class="btn ghost" data-act="sheet-close">${T('வேண்டாம்', 'Cancel')}</button><button class="btn ${danger ? 'danger' : ''}" id="ok">${esc(okLabel)}</button>`,
      { onClose: () => { if (!done) res(false); } });
    $('#ok').onclick = () => { done = true; closeSheet(); res(true); };
  });
}
/** A sheet with a form. fields: html. onSubmit(form) may throw to show an error. */
export function formSheet(title, html, submitLabel, onSubmit, opts) {
  const sh = openSheet(title, `<form id="fs" novalidate>${html}<p class="form-error" role="alert"></p></form>`,
    onSubmit ? `<button class="btn block" id="fs-ok" type="button">${ic('check', 20, 3)}${esc(submitLabel || T('சேமி', 'Save'))}</button>` : '', opts);
  const form = $('#fs'), err = form.querySelector('.form-error');
  const run = async () => {
    if (!onSubmit) return;
    const b = $('#fs-ok'); if (b.disabled) return; b.disabled = true; err.textContent = '';
    try { const r = await onSubmit(form, sh); if (r !== false) closeSheet(); }
    catch (e) { err.textContent = (e && e.userMessage) || (e && e.message) || String(e); }
    finally { if (b.isConnected) b.disabled = false; }
  };
  if (onSubmit) $('#fs-ok').onclick = run;
  form.onsubmit = e => { e.preventDefault(); run(); };
  return sh;
}
export const fieldHtml = (id, label, value, type, extra) => `<div class="field"><label for="${id}">${esc(label)}</label><input class="input" id="${id}" name="${id}" type="${type || 'text'}" value="${esc(value == null ? '' : value)}" ${extra || ''}></div>`;

/* ---------- PIN pad ---------- */
export function pinPad(title, sub, onDone) {
  const wrap = document.createElement('div'); wrap.className = 'lock';
  let pin = '';
  const draw = () => {
    wrap.innerHTML = `<span class="logo xl">${LOGO}</span><h2>${esc(title)}</h2><p>${esc(sub)}</p>
      <div class="pin-dots">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="keypad k3">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k === '' ? '<span></span>' : `<button class="key" data-k="${k}">${k}</button>`).join('')}</div>`;
  };
  draw();
  wrap.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    if (b.dataset.k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += b.dataset.k;
    draw();
    if (pin.length === 4) { const r = await onDone(pin); if (r === false) { pin = ''; wrap.animate && wrap.animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'none' }], 240); draw(); } else wrap.remove(); }
  });
  document.body.appendChild(wrap);
  return wrap;
}

/* ---------- files ---------- */
export async function shrinkImage(file, max = 1600) {
  if (!/^image\//.test(file.type) || file.size < 900 * 1024) return null;
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .82).split(',')[1];
  } catch (e) { return null; }
}
const readB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(Error('read')); r.readAsDataURL(f); });
/** Pick files; resolves [{id, data:{name,mime,data}}]. accept e.g. 'image/*,application/pdf' */
export function pickFiles(accept, multiple, limit) {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept || 'image/*,application/pdf'; input.multiple = !!multiple; input.hidden = true;
    document.body.appendChild(input);
    input.onchange = async () => {
      const out = [];
      for (const f of [...input.files].slice(0, limit || 5)) {
        if (f.size > 12 * 1024 * 1024) { toast(T('கோப்பு மிகப் பெரியது (12 MB வரை)', 'File too large (max 12 MB)')); continue; }
        const small = await shrinkImage(f);
        const data = small || await readB64(f);
        if (data.length > 7 * 1024 * 1024) { toast(T('5 MB-க்குக் குறைவான கோப்பைத் தேர்ந்தெடுக்கவும்', 'Choose a file under 5 MB')); continue; }
        out.push({ id: 'f' + uuid().replace(/-/g, '').slice(0, 24), data: { name: (small ? f.name.replace(/\.\w+$/, '') + '.jpg' : f.name).slice(0, 80), mime: small ? 'image/jpeg' : (f.type || 'application/octet-stream'), data } });
      }
      input.remove(); resolve(out);
    };
    input.click();
  });
}
export function readTextFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept || 'application/json,.json,text/plain'; input.hidden = true;
    document.body.appendChild(input);
    input.onchange = async () => { const f = input.files && input.files[0]; input.remove(); resolve(f ? await f.text() : null); };
    input.click();
  });
}
export function openFileData(meta, rec) {
  if (!rec) { toast(T('கோப்பு கிடைக்கவில்லை', 'File not found')); return; }
  if (native.open(meta.id, rec.name || meta.name, rec.mime, rec.data)) return;
  const bytes = Uint8Array.from(atob(rec.data), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: rec.mime }));
  const w = window.open(url, '_blank'); if (!w) { const a = document.createElement('a'); a.href = url; a.download = rec.name || 'file'; a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function saveFile(name, text, mime) {
  if (native.save(name, text, mime)) return true;
  const blob = new Blob([text], { type: mime });
  const file = typeof File === 'function' ? new File([blob], name, { type: mime }) : null;
  if (window.TL_DOWNLOADS) { try { await window.TL_DOWNLOADS.save({ filename: name, data: blob }); return true; } catch (e) { return false; } }
  if (isIOS() && file && navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).then(() => true, () => false);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return true;
}
export function shareText(text) {
  if (native.share(text)) return;
  if (navigator.share) { navigator.share({ text }).catch(() => { }); return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
export async function copyText(text) {
  if (native.copy(text)) return true;
  try { await navigator.clipboard.writeText(text); toast(T('நகலெடுக்கப்பட்டது', 'Copied')); return true; }
  catch (e) { toast(T('நகலெடுக்க முடியவில்லை — நீண்ட நேரம் அழுத்தி Copy செய்யவும்', 'Could not copy — long-press to copy')); return false; }
}

/* ---------- input hardening ----------
   Phones' password managers and autofill (iOS "Strong Password", saved e-mails, card AutoFill,
   Android autofill) were taking over our fields: keyboard hidden, every password box filled at once,
   old e-mails popping up. Every field is a plain field: no autofill, no suggestions;
   secrets are masked with CSS instead of type=password, so no password manager attaches. */
const MASK_OK = (() => { try { return CSS.supports('-webkit-text-security', 'disc'); } catch (e) { return false; } })();
export function hardenInputs(root) {
  if (!root || !root.querySelectorAll) return;
  const list = root.matches && root.matches('input,textarea') ? [root] : root.querySelectorAll('input,textarea');
  for (const el of list) {
    if (el.dataset.hard) continue; el.dataset.hard = '1';
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (/checkbox|radio|file|range|color|hidden|date|month|time|button|submit/.test(t)) continue;
    if (el.getAttribute('autocomplete') !== 'one-time-code') el.setAttribute('autocomplete', 'off');
    el.setAttribute('data-lpignore', 'true'); el.setAttribute('data-1p-ignore', 'true'); el.setAttribute('data-form-type', 'other');
    if (t === 'password' && MASK_OK) { el.type = 'text'; el.classList.add('secret'); }
    if (t === 'password' || t === 'email' || el.classList.contains('secret')) {
      el.setAttribute('autocapitalize', 'none'); el.setAttribute('autocorrect', 'off'); el.spellcheck = false;
      if (t === 'email') { el.type = 'text'; el.setAttribute('inputmode', 'email'); el.classList.add('is-email'); }
    }
    el.removeAttribute('list');
  }
}
/** Show / hide a masked field (works for both masked text and real password inputs). */
export function toggleSecret(el) {
  if (!el) return false;
  if (el.classList.contains('secret') || el.classList.contains('unmasked')) { el.classList.toggle('secret'); el.classList.toggle('unmasked'); return !el.classList.contains('secret'); }
  el.type = el.type === 'password' ? 'text' : 'password'; return el.type === 'text';
}
