/* sw.js — ตัวล้างแคชเก่า: ลบแคชทั้งหมด ยกเลิกตัวเอง แล้วรีเฟรชหน้าเกมให้ได้เวอร์ชันล่าสุด */
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(function (c) { c.navigate(c.url); });
  })());
});
