import {recoveryCode,recoveryLookup,wrapRecovery,unwrapRecovery} from './recovery.js';
import {shortCode,makeJoinKey,fingerprint,wrapInvite,unwrapInvite} from './invitations.js';
import { seal, open, newGroupKey, importGroupKey } from './encryption.js';
import { emptyLedger, validateLedger, uid } from './group-ledger.js';
import { pack, unpack } from './device-vault.js';
const LIMIT = 50331648;
const ctx = (group, revision, id = group, kind = 'catalog') => ({ groupId: group, documentId: id, kind, revision, deleted: false });
const check = ({ data, error }) => { if (error) { const e = Error(error.code === '40001' ? 'Another person changed this account. Refresh before saving / வேறொருவர் மாற்றியுள்ளார். Refresh செய்யவும்.' : error.message); e.code = error.code; throw e; } return data; };
export class Groups {
  constructor(client, vault) { this.client = client; this.vault = vault; this.busy = false; this.current = null; }
  async list() { return check(await this.client.from('tl2_groups').select('id,name,owner_id,revision,epoch').order('name')); }
  async fetchRow(id) { return check(await this.client.from('tl2_groups').select('*').eq('id', id).single()); }
  async create(name) {
    const id = uid(), fresh = await newGroupKey(), ledger = emptyLedger();
    // Persist recoverable key locally BEFORE server creation; a network ambiguity cannot lose it.
    await this.vault.put(id, fresh.recoveryKey, 1, 1);
    const envelope = await seal(ledger, fresh.key, ctx(id, 1), LIMIT);
    check(await this.client.rpc('tl2_create', { p_id: id, p_name: name.trim(), p_envelope: envelope }));
    return this.load(id);
  }
  async load(id) {
    const row = await this.fetchRow(id), stored = this.vault.get(id);
    if (!stored || stored.epoch !== row.epoch) { const e = Error('Group key required / குழு சாவியை உள்ளிடுங்கள்'); e.code = 'KEY_REQUIRED'; e.group = row; throw e; }
    if (row.revision < (stored.revision || 0)) throw Error('Older server version detected. Do not overwrite your latest data.');
    const key = await importGroupKey(stored.raw);
    const ledger = validateLedger(await open(row.envelope, key, ctx(id, row.revision), LIMIT));
    const members = check(await this.client.from('tl2_members').select('*').eq('group_id', id));
    const { data: { session } } = await this.client.auth.getSession();
    const role = members.find(m => m.user_id === session?.user?.id)?.role;
    if (!role) throw Error('Group access removed');
    await this.vault.put(id, stored.raw, row.epoch, row.revision);
    this.current = { row, key, ledger, members, role, userId: session.user.id };
    return this.current;
  }
  async save(ledger) {
    const c = this.current;
    if (!c || !['admin', 'editor'].includes(c.role) || this.busy) throw Error('Cannot save now');
    validateLedger(ledger); this.busy = true;
    try {
      const envelope = await seal(ledger, c.key, ctx(c.row.id, c.row.revision + 1), LIMIT);
      const revision = check(await this.client.rpc('tl2_save', { p_group: c.row.id, p_expected: c.row.revision, p_epoch: c.row.epoch, p_envelope: envelope }));
      if (revision !== c.row.revision + 1) throw Error('Refresh to confirm your save');
      await this.vault.put(c.row.id, this.vault.get(c.row.id).raw, c.row.epoch, revision);
      this.current = { ...c, row: { ...c.row, revision, envelope }, ledger: structuredClone(ledger) };
    } finally { this.busy = false; }
  }
  async shortRecovery(){const c=this.current;if(c?.role!=='admin')throw Error('Admin required');const code=recoveryCode();const bundle=await wrapRecovery(code,c.userId,this.accessCode());check(await this.client.rpc('tl5_save_recovery',{p_group:c.row.id,p_epoch:c.row.epoch,p_lookup:await recoveryLookup(code),p_bundle:bundle}));return code;}
  async restoreShortRecovery(code){const {data:{session}}=await this.client.auth.getSession();if(!session)throw Error('Sign in required');const result=check(await this.client.rpc('tl5_restore_recovery',{p_lookup:await recoveryLookup(code)}));if(result.status==='wait')throw Error('Too many recovery attempts. Wait 10 minutes.');if(result.status!=='ready')throw Error('Code not found for this login, or key changed.');const payload=await unwrapRecovery(code,session.user.id,result.bundle);return this.accept(payload);}
  accessCode() { const c = this.current, k = this.vault.get(c.row.id); if (c.role !== 'admin') throw Error('Admin required'); return pack({ v: 1, group: c.row.id, epoch: c.row.epoch, key: k.raw }); }
  async inviteShort(email,role){const code=shortCode();check(await this.client.rpc('tl3_invite',{p_group:this.current.row.id,p_email:email.trim(),p_role:role,p_code:code}));return code;}
  async joinShort(code){
    code=code.trim();if(!/^[A-Za-z0-9]{8}$/.test(code))throw Error('Enter the 8-character code');
    let device=this.vault.getSecret('join:'+code);if(!device){device=await makeJoinKey();await this.vault.putSecret('join:'+code,device);}
    const result=check(await this.client.rpc('tl3_request',{p_code:code,p_public:device.publicKey}));
    if(result.status==='ready'){
      const {data:{session}}=await this.client.auth.getSession();
      const raw=await unwrapInvite(result.bundle,device,result.group,result.epoch,session.user.id);
      await this.accept(pack({v:1,group:result.group,epoch:result.epoch,key:raw}));return result;
    }
    return {...result,fingerprint:await fingerprint(device.publicKey)};
  }
  async pending(){return check(await this.client.rpc('tl3_pending',{p_group:this.current.row.id}));}
  async approve(request){const c=this.current;const bundle=await wrapInvite(this.vault.get(c.row.id).raw,request.public_key,c.row.id,request.epoch,request.request_user);check(await this.client.rpc('tl3_approve',{p_group:c.row.id,p_id:request.id,p_public:request.public_key,p_epoch:request.epoch,p_bundle:bundle}));}
  async cancelInvite(id){check(await this.client.rpc('tl3_cancel',{p_group:this.current.row.id,p_id:id}));}
  async invite(email, role) {
    const c = this.current; if (c.role !== 'admin') throw Error('Admin required');
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
    check(await this.client.rpc('tl2_invite', { p_group: c.row.id, p_email: email.trim(), p_role: role, p_token: token }));
    return pack({ v: 1, group: c.row.id, epoch: c.row.epoch, key: this.vault.get(c.row.id).raw, token });
  }
  async accept(code) {
    const d = unpack(code), key = await importGroupKey(d.key);
    if (d.token) {
      if (!/^[0-9a-f]{64}$/.test(d.token)) throw Error('Invalid invitation');
      const response = await this.client.rpc('tl2_accept', { p_group: d.group, p_token: d.token });
      // An earlier successful acceptance may have lost its response. Recheck actual membership via RLS.
      if (response.error) { try { await this.fetchRow(d.group); } catch { check(response); } }
    }
    const row = await this.fetchRow(d.group);
    if (d.epoch !== row.epoch) throw Error('Old group code. Ask the admin for the current one.');
    validateLedger(await open(row.envelope, key, ctx(d.group, row.revision), LIMIT));
    if ((this.vault.get(d.group)?.revision || 0) > row.revision) throw Error('Older server version detected');
    await this.vault.put(d.group, d.key, d.epoch, row.revision);
    return this.load(d.group);
  }
  async setRole(user, role) { check(await this.client.rpc('tl2_role', { p_group: this.current.row.id, p_user: user, p_role: role })); return this.load(this.current.row.id); }
  async comments() {
    const c = this.current;
    const rows = check(await this.client.from('tl2_comments').select('*').eq('group_id', c.row.id));
    return Promise.all(rows.map(async row => ({ ...row, value: await open(row.envelope, c.key, ctx(c.row.id, row.revision, row.id, 'comment')) })));
  }
  async comment(text) {
    const c = this.current, id = uid(); if (!text.trim() || text.length > 2000) throw Error('Comment must be 1–2000 characters');
    const envelope = await seal({ text: text.trim(), date: new Date().toISOString() }, c.key, ctx(c.row.id, 1, id, 'comment'));
    check(await this.client.rpc('tl2_comment', { p_group: c.row.id, p_id: id, p_expected: 0, p_epoch: c.row.epoch, p_envelope: envelope }));
  }
  async removeMember(user) {
    const c = this.current; if (this.busy || c.role !== 'admin') throw Error('Cannot remove now'); this.busy = true;
    try {
      const comments = await this.comments(), fresh = await newGroupKey();
      const envelope = await seal(c.ledger, fresh.key, ctx(c.row.id, c.row.revision + 1), LIMIT);
      const encryptedComments = await Promise.all(comments.map(async x => ({ id: x.id, expected: x.revision, envelope: await seal(x.value, fresh.key, ctx(c.row.id, x.revision + 1, x.id, 'comment')) })));
      // Preserve both old and new keys until the rotation's network result is known.
      const pendingId = c.row.id + ':rotation';
      await this.vault.put(pendingId, fresh.recoveryKey, c.row.epoch + 1);
      const response = await this.client.rpc('tl2_rotate', { p_group: c.row.id, p_expected: c.row.revision, p_epoch: c.row.epoch, p_envelope: envelope, p_comments: encryptedComments, p_remove: user });
      if (response.error) throw Object.assign(Error('Removal not confirmed. Refresh; keep your recovery codes.'), { code: response.error.code });
      await this.vault.put(c.row.id, fresh.recoveryKey, c.row.epoch + 1, c.row.revision + 1);
      await this.load(c.row.id);
      return this.accessCode();
    } finally { this.busy = false; }
  }
  async recoverPendingRotation(id) {
    const pending = this.vault.get(id + ':rotation');
    if (!pending) return false;
    const row = await this.fetchRow(id);
    if (row.epoch !== pending.epoch) return false;
    const key = await importGroupKey(pending.raw);
    await open(row.envelope, key, ctx(id, row.revision), LIMIT);
    await this.vault.put(id, pending.raw, pending.epoch, row.revision); return true;
  }
}
