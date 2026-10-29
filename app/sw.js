/* Offline cache. Bump VERSION on every release. */
const VERSION = 'tl4-4.2.1';
const FILES = ['./', 'index.html', 'css/app.css', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'js/main.js', 'js/core/util.js', 'js/core/ledger.js', 'js/core/import-old.js', 'js/core/vault.js', 'js/data/db.js', 'js/data/local-book.js', 'js/data/backup.js', 'js/ui/kit.js', 'js/views/ledger.js', 'js/views/import.js', 'js/views/details.js', 'js/views/online.js', 'js/views/more.js', 'js/online/supa.js', 'js/online/encryption.js', 'js/online/invitations.js', 'js/online/recovery.js', 'js/online/device-vault.js', 'js/online/group-ledger.js', 'js/online/personal-model.js', 'js/online/groups.js', 'js/online/phone.js', 'js/online/group-book.js', 'js/online/key-sync.js', 'js/i18n/hi.js', 'js/i18n/zh.js', 'js/i18n/es.js', 'js/i18n/ar.js', 'js/i18n/fr.js', 'js/i18n/bn.js', 'js/i18n/pt.js', 'js/i18n/ru.js', 'js/i18n/ur.js', 'js/i18n/id.js', 'js/i18n/de.js', 'js/i18n/ja.js', 'js/i18n/te.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSION).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('version.json')) return;
  // Network first for the page so updates arrive quickly; cache fallback offline.
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).then(r => { caches.open(VERSION).then(c => c.put('./', r.clone())); return r; }).catch(() => caches.match('./'))); return; }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); } return r; })));
});
