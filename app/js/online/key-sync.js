/* Group-key sync across the user's own phones, so a new phone opens groups with just the login.
   Each group key is locked with a key derived from the login password (PBKDF2 600k, AES-256-GCM)
   before it is sent; the server stores only the locked bundle (tl6_save_key / tl6_load_keys).
   If the server does not have these functions yet, everything silently falls back to recovery codes. */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const aad = (userId, groupId, epoch) => enc.encode('team-ledger-key-sync:v1:' + userId + ':' + groupId + ':' + epoch);

export async function createKeySync(client, userId, password) {
  const salt = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('team-ledger-key-sync-salt:' + userId))).slice(0, 16);
  const seed = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, seed, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  let available = true;
  const call = async (fn, args) => {
    if (!available) return null;
    const r = await client.rpc(fn, args);
    if (r.error) { if (/PGRST202|42883|not find|does not exist/i.test((r.error.code || '') + ' ' + (r.error.message || ''))) available = false; return null; }
    return r.data === undefined || r.data === null ? true : r.data;
  };
  return {
    get available() { return available; },
    async upload(groupId, epoch, raw) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(userId, groupId, epoch) }, key, enc.encode(JSON.stringify({ raw, epoch })));
      return (await call('tl6_save_key', { p_group: groupId, p_epoch: epoch, p_bundle: JSON.stringify({ v: 1, iv: b64(iv), data: b64(data) }) })) !== null;
    },
    /** → [{ group, epoch, raw }] for every group this login has a readable key for. */
    async download() {
      const rows = await call('tl6_load_keys', {});
      const out = [];
      if (!Array.isArray(rows)) return out;
      for (const r of rows) {
        try {
          const d = JSON.parse(r.bundle);
          if (d.v !== 1) continue;
          const plain = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(d.iv), additionalData: aad(userId, r.group_id, r.epoch) }, key, bytes(d.data))));
          if (plain.epoch === r.epoch && typeof plain.raw === 'string') out.push({ group: r.group_id, epoch: r.epoch, raw: plain.raw });
        } catch (e) { /* locked with an older password: re-uploaded by a phone that has the key */ }
      }
      return out;
    }
  };
}
