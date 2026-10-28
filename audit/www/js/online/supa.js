/* Minimal Supabase client (Auth + PostgREST) — no SDK needed.
   Access/refresh tokens stay in memory only; a short-lived PKCE verifier survives email hand-off. */
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const VERIFIER_KEY = 'tl-group-auth-v1-code-verifier';

function authError(status, body) {
  const e = Error((body && (body.msg || body.message || body.error_description || body.error)) || ('HTTP ' + status));
  e.status = status;
  e.code = (body && (body.error_code || (typeof body.code === 'string' ? body.code : '') || body.error)) || '';
  if (/invalid.*(login|credentials|grant)/i.test(e.message) && !e.code) e.code = 'invalid_credentials';
  if (e.code === 'invalid_grant' && /credentials/i.test(e.message)) e.code = 'invalid_credentials';
  if (/email not confirmed/i.test(e.message)) e.code = 'email_not_confirmed';
  return e;
}

export function createClient(projectUrl, key, fetchImpl) {
  const base = projectUrl.replace(/\/$/, '');
  const F = fetchImpl || ((u, o) => fetch(u, o));
  let session = null, refreshTimer = null;
  const listeners = new Set();
  const call = async (url, opt) => {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
    try { return await F(url, Object.assign({ redirect: 'error', credentials: 'omit', cache: 'no-store' }, opt, ctrl ? { signal: ctrl.signal } : {})); }
    finally { if (t) clearTimeout(t); }
  };
  async function authFetch(path, body, query) {
    const r = await call(base + '/auth/v1/' + path + (query ? '?' + query : ''), { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}) }, body: JSON.stringify(body || {}) });
    const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { }
    if (!r.ok) throw authError(r.status, j);
    return j;
  }
  function setSession(s) {
    session = s && s.access_token ? { ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) } : null;
    clearTimeout(refreshTimer);
    if (session && session.refresh_token) {
      const wait = Math.max(30, session.expires_at - Math.floor(Date.now() / 1000) - 120) * 1000;
      refreshTimer = setTimeout(() => auth.refresh().catch(() => { }), wait);
    }
    listeners.forEach(fn => { try { fn(session); } catch (e) { } });
  }
  async function pkce(type) {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    try { localStorage.setItem(VERIFIER_KEY, JSON.stringify({ value: verifier, type, expires: Date.now() + 3600000 })); } catch (e) { }
    return { code_challenge: challenge, code_challenge_method: 's256' };
  }
  const wrap = async fn => { try { return { data: await fn(), error: null }; } catch (error) { return { data: null, error }; } };
  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    signInWithPassword: creds => wrap(async () => { const j = await authFetch('token', creds, 'grant_type=password'); setSession(j); return { session, user: j.user }; }),
    refresh: async () => { if (!session) return null; const j = await authFetch('token', { refresh_token: session.refresh_token }, 'grant_type=refresh_token'); setSession(j); return session; },
    signUp: ({ email, phone, password, options = {} }) => wrap(async () => {
      const body = phone ? { phone, password, channel: options.channel || 'sms' } : { email, password, data: {}, ...(await pkce('signup')) };
      const j = await authFetch('signup', body, options.emailRedirectTo ? 'redirect_to=' + encodeURIComponent(options.emailRedirectTo) : '');
      if (j && j.access_token) setSession(j);
      return { session: j && j.access_token ? session : null, user: j && (j.user || j) };
    }),
    verifyOtp: ({ phone, token, type }) => wrap(async () => { const j = await authFetch('verify', { phone, token, type }); if (j && j.access_token) setSession(j); return { session, user: j && j.user }; }),
    resend: ({ type, phone }) => wrap(() => authFetch('resend', { type, phone })),
    resetPasswordForEmail: (email, { redirectTo } = {}) => wrap(async () => authFetch('recover', { email, ...(await pkce('recovery')) }, redirectTo ? 'redirect_to=' + encodeURIComponent(redirectTo) : '')),
    exchangeCodeForSession: code => wrap(async () => {
      let v = null; try { v = JSON.parse(localStorage.getItem(VERIFIER_KEY)); } catch (e) { }
      if (!v || v.expires < Date.now()) throw Error('Link expired');
      const j = await authFetch('token', { auth_code: code, code_verifier: v.value }, 'grant_type=pkce');
      try { localStorage.removeItem(VERIFIER_KEY); } catch (e) { }
      setSession(j); return { session, user: j.user, redirectType: v.type === 'recovery' ? 'recovery' : null };
    }),
    updateUser: attrs => wrap(async () => { const r = await call(base + '/auth/v1/user', { method: 'PUT', headers: { apikey: key, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(attrs) }); const j = await r.json().catch(() => null); if (!r.ok) throw authError(r.status, j); return j; }),
    signOut: async () => { const s = session; setSession(null); if (s) { try { await call(base + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + s.access_token } }); } catch (e) { } } return { error: null }; },
    settings: async () => { const r = await call(base + '/auth/v1/settings', { headers: { apikey: key } }); if (!r.ok) throw Error('settings'); return r.json(); }
  };
  async function rest(path, opt = {}) {
    if (session && session.expires_at * 1000 < Date.now() + 30000) { try { await auth.refresh(); } catch (e) { } }
    const r = await call(base + '/rest/v1/' + path, { ...opt, headers: { apikey: key, Authorization: 'Bearer ' + (session ? session.access_token : key), 'Content-Type': 'application/json', ...(opt.headers || {}) } });
    const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { }
    if (!r.ok) { const e = Error((j && (j.message || j.msg)) || ('HTTP ' + r.status)); e.code = (j && j.code) || String(r.status); e.status = r.status; e.details = j && j.details; throw e; }
    return j;
  }
  function from(table) {
    const q = { select: '*', filters: [], order: null, single: false };
    const builder = {
      select(cols) { q.select = cols || '*'; return builder; },
      eq(col, val) { q.filters.push(col + '=eq.' + encodeURIComponent(val)); return builder; },
      order(col, o = {}) { q.order = col + (o.ascending === false ? '.desc' : '.asc'); return builder; },
      single() { q.single = true; return builder; },
      then(res, rej) {
        const path = table + '?select=' + encodeURIComponent(q.select) + (q.filters.length ? '&' + q.filters.join('&') : '') + (q.order ? '&order=' + q.order : '');
        return rest(path, q.single ? { headers: { Accept: 'application/vnd.pgrst.object+json' } } : {}).then(data => ({ data, error: null }), error => ({ data: null, error })).then(res, rej);
      }
    };
    return builder;
  }
  const rpc = (name, args) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) }).then(data => ({ data, error: null }), error => ({ data: null, error }));
  return { auth, from, rpc, rest, get session() { return session; } };
}
