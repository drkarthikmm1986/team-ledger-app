// Keys are caller-owned, held in memory, and never sent to the API.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(['account', 'entry', 'hold', 'profit', 'catalog', 'comment']);
export const MAX_ENVELOPE_BYTES = 1048576;
const MAX_PLAINTEXT_BYTES = 780000;
function b64(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i += 8192) str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(str);
}
function unb64(str) {
  if (typeof str !== 'string' || str.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(str)) throw Error('Invalid encrypted data');
  const bytes = Uint8Array.from(atob(str), ch => ch.charCodeAt(0));
  if (b64(bytes) !== str) throw Error('Invalid encrypted data');
  return bytes;
}
function binding(context) {
  if (!context || !UUID.test(context.groupId) || !UUID.test(context.documentId) || !KINDS.has(context.kind)
    || !Number.isSafeInteger(context.revision) || context.revision < 1 || typeof context.deleted !== 'boolean') {
    throw Error('Invalid document context');
  }
  return encoder.encode(JSON.stringify(['team-ledger', 1, context.groupId.toLowerCase(), context.documentId.toLowerCase(), context.kind, context.revision, context.deleted]));
}
export async function newGroupKey() {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const recoveryKey = b64(raw);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  raw.fill(0);
  return { key, recoveryKey };
}
export async function importGroupKey(recoveryKey) {
  const raw = unb64(recoveryKey);
  if (raw.length !== 32) throw Error('Group key must contain 32 random bytes');
  try { return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  finally { raw.fill(0); }
}
export async function seal(value, key, context, limit = MAX_ENVELOPE_BYTES) {
  if (!Number.isSafeInteger(limit) || limit < 1024 || limit > 50331648) throw Error("Invalid size limit");
  const additionalData = binding(context);
  const json = JSON.stringify(value);
  if (json === undefined) throw Error('Missing document');
  const bytes = encoder.encode(json);
  if (bytes.length > Math.min(limit === MAX_ENVELOPE_BYTES ? MAX_PLAINTEXT_BYTES : Math.floor(limit * .74), 37200000)) throw Error('Document too large; attachment chunking is required');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, bytes);
  const envelope = JSON.stringify({ v: 1, iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)) });
  if (encoder.encode(envelope).length > limit) throw Error('Encrypted document too large');
  return envelope;
}
export async function open(envelope, key, context, limit = MAX_ENVELOPE_BYTES) {
  if (!Number.isSafeInteger(limit) || limit < 1024 || limit > 50331648) throw Error("Invalid size limit");
  const additionalData = binding(context);
  if (typeof envelope !== 'string' || encoder.encode(envelope).length > limit) throw Error('Invalid encrypted data');
  const data = JSON.parse(envelope);
  if (!data || data.v !== 1 || Object.keys(data).sort().join(',') !== 'ciphertext,iv,v') throw Error('Unsupported encrypted format');
  const iv = unb64(data.iv), ciphertext = unb64(data.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 16) throw Error('Invalid encrypted data');
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, ciphertext);
  return JSON.parse(decoder.decode(bytes));
}
