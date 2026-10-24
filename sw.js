// Lets the app be installed on the home screen (needed for notifications on iPhone and iPad).
// Always uses the network so changes show straight away; falls back to the last copy
// of the app pages when offline.
const CACHE = 'eh-app-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // no-cache: always ask the server whether the file changed, so updates show on the next open.
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req)));
});

// Push notifications (Firebase Cloud Messaging web push): show them, and open the app on tap.
self.addEventListener('push', e => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { msg = { notification: { body: e.data && e.data.text() } }; }
  const n = msg.notification || {};
  const data = msg.data || {};
  const link = (msg.fcmOptions && msg.fcmOptions.link) || data.link || self.registration.scope;
  e.waitUntil(self.registration.showNotification(n.title || 'EmptyHands', {
    body: n.body || '', icon: n.icon || 'home-icon-192.png', badge: n.badge || 'home-icon-192.png', data: { link }, tag: msg.fcmMessageId,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || self.registration.scope;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) return open.focus().then(c => (c && c.navigate ? c.navigate(link) : c));
    return clients.openWindow(link);
  }));
});
