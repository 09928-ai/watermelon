/* sw.js — service worker ของ Fruit Slice
   เปลี่ยนเลขเวอร์ชัน CACHE ทุกครั้งที่แก้ไฟล์เกม เพื่อให้มือถือโหลดของใหม่ */
const CACHE = 'fruit-slice-v3';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/sfx.js',
  './js/game.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ออนไลน์: โหลดของใหม่ก่อนแล้วเก็บแคช / ออฟไลน์: ใช้ของในแคช
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
