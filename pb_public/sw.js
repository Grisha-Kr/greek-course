// Сервис-воркер: хранит оболочку приложения, шрифты и данные учебника, чтобы приложение открывалось и без интернета.
// Ответы сервера (/api/) никогда не кэшируются.
const VERSION = 'greek-v4';
const SHELL = ['/', '/index.html', '/app.css?v=4', '/app.js?v=4', '/vendor/pocketbase.umd.js', '/manifest.webmanifest',
  '/data/letters.js?v=1', '/data/words.js?v=1', '/data/chapters.js?v=1', '/data/dictionary.js?v=1', '/data/parts.js?v=1', '/data/course.js?v=1', '/icons/icon-192.png?v=1', '/icons/favicon-32.png?v=1',
  '/fonts/GentiumPlus-Regular.woff2', '/fonts/GentiumPlus-Bold.woff2',
  '/fonts/golos-text-cyrillic-400-normal.woff2', '/fonts/golos-text-cyrillic-500-normal.woff2', '/fonts/golos-text-cyrillic-600-normal.woff2',
  '/fonts/golos-text-latin-400-normal.woff2', '/fonts/golos-text-latin-500-normal.woff2', '/fonts/golos-text-latin-600-normal.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_/')) return;
  // Сначала сеть, при отсутствии связи берём из кэша
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && (url.pathname === '/' || /\.(html|css|js|woff2|png|svg|webmanifest)$/.test(url.pathname))) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, {ignoreSearch: e.request.mode === 'navigate'}).then(r => r || caches.match('/')))
  );
});
