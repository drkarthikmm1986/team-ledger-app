/* Account Details vault — same encrypted envelope as the old Team Ledger app:
   PBKDF2-SHA256 (600,000) → AES-256-GCM, additional data "TeamLedger.AccountDetails.v1".
   Mode "open": the access key lives in the envelope (no password). Mode password: user passphrase. */
import { b64, unb64, uuid } from './util.js';

export const ITERATIONS = 600000;
const AAD = new TextEncoder().encode('TeamLedger.AccountDetails.v1');
const MAX_BYTES = 18 * 1024 * 1024;

/* Field catalogue (keys identical to the old app). */
export const FIELDS = {
  bank: [['name', 'கணக்கின் பெயர்', 'Account name'], ['holder', 'கணக்கு வைத்திருப்பவர்', 'Account holder'], ['bank', 'வங்கி', 'Bank'], ['number', 'வங்கி கணக்கு எண்', 'Account number'], ['ifsc', 'IFSC', 'IFSC'], ['branch', 'கிளை', 'Branch'], ['type', 'Savings / Current', 'Savings / Current']],
  ids: [['pan', 'PAN எண்', 'PAN number'], ['aadhaar', 'ஆதார் எண்', 'Aadhaar number'], ['netUser', 'Net Banking User ID', 'Net Banking User ID'], ['notes', 'குறிப்பு', 'Notes']],
  secrets: [['cardNumber', 'ATM கார்டு எண்', 'ATM card number'], ['expiry', 'கார்டு காலாவதி (MM/YY)', 'Card expiry (MM/YY)'], ['cvv', 'CVV', 'CVV'], ['atmPin', 'ATM PIN', 'ATM PIN'], ['password', 'கடவுச்சொல்', 'Password'], ['netPassword', 'Net Banking கடவுச்சொல்', 'Net Banking password']]
};
export const REPEATS = [['upiIds', 'UPI ID', 'UPI ID', 'upi'], ['businessUpiIds', 'Business UPI ID', 'Business UPI ID', 'businessUpi'], ['phones', 'போன் எண்', 'Phone number', 'phone'], ['emails', 'மின்னஞ்சல்', 'Email', 'email'], ['otherIds', 'மற்ற ID', 'Other ID', 'otherId']];
const LEGACY = ['upi', 'businessUpi', 'otherIdLabel', 'otherId', 'phone', 'email'];
const ALL_TEXT = [...FIELDS.bank, ...FIELDS.ids, ...FIELDS.secrets].map(x => x[0]).concat(LEGACY);
export const SECRET_KEYS = new Set(FIELDS.secrets.map(x => x[0]).concat(['aadhaar', 'pan']));
export const FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

export function blankRecord() {
  const r = { id: uuid(), files: [], summary: ['name', 'holder', 'bank', 'type'], journal: ['name', 'holder', 'bank', 'number', 'ifsc', 'type'] };
  for (const k of ALL_TEXT) r[k] = '';
  return r;
}
/** Repeated contact rows, merging the old single-value fields. */
export function repeatRows(r, key) {
  const def = REPEATS.find(x => x[0] === key);
  const rows = Array.isArray(r[key]) ? r[key].slice() : [];
  const legacy = def[3];
  if (legacy && r[legacy] && !rows.some(x => x.value === r[legacy])) rows.unshift({ label: key === 'otherIds' ? (r.otherIdLabel || '') : '', value: r[legacy] });
  return rows;
}
export function validateRecords(records) {
  if (!Array.isArray(records) || records.length > 500) throw Error('Maximum 500 account details');
  const ids = new Set();
  for (const r of records) {
    if (!r || typeof r.id !== 'string' || ids.has(r.id) || !String(r.name || '').trim()) throw Error('Every account detail needs a name');
    ids.add(r.id);
    for (const k of ALL_TEXT) if (r[k] !== undefined && (typeof r[k] !== 'string' || r[k].length > (k === 'notes' ? 2000 : 200))) throw Error('Check ' + k);
    if (!Array.isArray(r.files) || r.files.length > 5) throw Error('Up to 5 documents');
    if (!Array.isArray(r.summary)) r.summary = ['name', 'holder', 'bank', 'type'];
    for (const [k] of REPEATS) if (r[k] !== undefined && (!Array.isArray(r[k]) || r[k].length > 20 || r[k].some(v => !v || typeof v.label !== 'string' || typeof v.value !== 'string' || !v.value || v.label.length > 80 || v.value.length > 200))) throw Error('Check ' + k);
    for (const f of r.files) if (!f || typeof f.name !== 'string' || f.name.length > 255 || !FILE_TYPES.includes(f.type) || typeof f.data !== 'string' || f.data.length > 7 * 1024 * 1024 || !f.data.startsWith('data:' + f.type + ';base64,')) throw Error('Invalid document');
  }
  return records;
}
export function validateEnvelope(v) {
  if (!v || v.version !== 1 || v.iterations !== ITERATIONS || typeof v.salt !== 'string' || typeof v.iv !== 'string' || typeof v.data !== 'string') throw Error('Invalid account details data');
  if (unb64(v.salt).length !== 16 || unb64(v.iv).length !== 12) throw Error('Invalid account details data');
  if (v.accessMode !== undefined && (v.accessMode !== 'open' || !/^[A-Za-z0-9+/]{43}=$/.test(v.accessKey || ''))) throw Error('Invalid access mode');
  return v;
}
export async function deriveKey(pass, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function openWithKey(envelope, key) {
  let records;
  try { records = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv), additionalData: AAD }, key, unb64(envelope.data)))); }
  catch (e) { const x = Error('wrong-pass'); x.code = 'WRONG_PASS'; throw x; }
  return validateRecords(records);
}
/** Unlock: returns { records, key, salt }. pass ignored in open mode. */
export async function unlock(envelope, pass) {
  validateEnvelope(envelope);
  const salt = unb64(envelope.salt);
  const key = await deriveKey(envelope.accessMode === 'open' ? envelope.accessKey : pass, salt);
  return { records: await openWithKey(envelope, key), key, salt };
}
/** Encrypt with an existing session key, keeping salt/mode/display choices. */
export async function seal(records, session, base) {
  validateRecords(records);
  const plain = new TextEncoder().encode(JSON.stringify(records));
  if (plain.length > MAX_BYTES) throw Error('Documents are too large. Remove or reduce a file.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, session.key, plain);
  const env = { version: 1, iterations: ITERATIONS, salt: b64(session.salt), iv: b64(iv), data: b64(new Uint8Array(data)) };
  if (session.mode === 'open') { env.accessMode = 'open'; env.accessKey = session.accessKey; }
  if (base && Array.isArray(base.cardFields)) env.cardFields = base.cardFields;
  if (base && Array.isArray(base.journalFields)) env.journalFields = base.journalFields;
  return env;
}
/** New session: mode 'open' (no password) or 'password'. */
export async function newSession(mode, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  if (mode === 'open') { const accessKey = b64(crypto.getRandomValues(new Uint8Array(32))); return { mode, salt, accessKey, key: await deriveKey(accessKey, salt) }; }
  if (!pass || pass.length < 6) throw Error('pass-short');
  return { mode: 'password', salt, key: await deriveKey(pass, salt) };
}
export const sessionFrom = (envelope, unlocked) => ({ mode: envelope.accessMode === 'open' ? 'open' : 'password', salt: unlocked.salt, key: unlocked.key, accessKey: envelope.accessKey });

/* Remember-on-this-device: keep only a non-extractable CryptoKey in IndexedDB (same DB name as the old app). */
function keyStore(op, id, value) {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open('ledger-account-device-keys', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('keys');
      req.onerror = () => resolve(null);
      req.onsuccess = () => { const db = req.result; try { const tx = db.transaction('keys', op === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('keys'); let out = null; const r = op === 'get' ? st.get(id) : op === 'del' ? st.delete(id) : st.put(value, id); r.onsuccess = () => { out = r.result; }; tx.oncomplete = () => { db.close(); resolve(out); }; tx.onerror = () => { db.close(); resolve(null); }; } catch (e) { db.close(); resolve(null); } };
    } catch (e) { resolve(null); }
  });
}
export const rememberKey = (envelope, key) => keyStore('put', 'tl4:' + envelope.salt, key);
export const forgetKey = envelope => keyStore('del', 'tl4:' + envelope.salt);
export async function rememberedUnlock(envelope) {
  const key = await keyStore('get', 'tl4:' + envelope.salt);
  if (!key || key.type !== 'secret') return null;
  try { return { records: await openWithKey(envelope, key), key, salt: unb64(envelope.salt) }; } catch (e) { return null; }
}
/** Copy text for selected fields of a record. */
export function recordText(r, keys, label) {
  const out = [];
  const add = (k, title) => { if (keys && !keys.includes(k)) return; const v = r[k]; if (v) out.push(title + ': ' + v); };
  for (const [k, ta, en] of [...FIELDS.bank, ...FIELDS.ids, ...FIELDS.secrets]) add(k, label(ta, en));
  for (const [k, ta, en] of REPEATS) { if (keys && !keys.includes(k)) continue; for (const row of repeatRows(r, k)) out.push((row.label ? row.label + ' ' : '') + label(ta, en) + ': ' + row.value); }
  return out.join('\n');
}
