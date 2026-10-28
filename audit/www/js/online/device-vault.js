import { importGroupKey } from './encryption.js';
const encode = bytes => btoa(String.fromCharCode(...bytes));
const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function unlockDeviceVault(userId, password) {
  const storageName = 'tl-group-keys:' + userId;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(storageName)); } catch { /* invalid vault is not opened */ }
  const salt = saved?.salt ? decode(saved.salt) : crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw Error('Invalid local key vault. Use your recovery code.');
  const seed = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, seed, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const context = new TextEncoder().encode('team-ledger-device-vault:' + userId);
  let keys = {}, needsRecovery = false;
  if (saved?.ciphertext) {
    try { keys = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(saved.iv), additionalData: context }, key, decode(saved.ciphertext)))); }
    catch { needsRecovery = true; }
  }
  async function persist(next) {
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:context},key,new TextEncoder().encode(JSON.stringify(next))));
    if(needsRecovery&&saved)localStorage.setItem(storageName+':previous',JSON.stringify(saved));
    localStorage.setItem(storageName,JSON.stringify({v:1,salt:encode(salt),iv:encode(iv),ciphertext:encode(data)}));keys=next;needsRecovery=false;
  }
  return {
    needsRecovery,
    get: groupId => keys[groupId],
    async put(groupId, raw, epoch, revision = 0) {
      await importGroupKey(raw);
      if (!Number.isInteger(epoch) || epoch < 1) throw Error('Invalid key version');
      if (!Number.isSafeInteger(revision) || revision < 0) throw Error('Invalid revision');
      const highest = keys[groupId]?.epoch === epoch ? Math.max(keys[groupId]?.revision || 0, revision) : revision;
      await persist({ ...keys, [groupId]: { raw, epoch, revision: highest } });
    },
    getSecret: id => keys['device:' + id],
    async putSecret(id, value) { if(JSON.stringify(value).length>8192)throw Error('Invalid device key');await persist({...keys,['device:'+id]:value}); },
    clearMemory() { keys = {}; }
  };
}
export const pack = data => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(data))));
export function unpack(code) {
  if (typeof code !== 'string' || code.trim().length > 4096) throw Error('Invalid group code');
  const d = JSON.parse(new TextDecoder().decode(decode(code.trim())));
  if (d.v !== 1 || !/^[a-f0-9-]{36}$/i.test(d.group) || !Number.isInteger(d.epoch) || d.epoch < 1 || typeof d.key !== 'string') throw Error('Invalid group code');
  return d;
}
