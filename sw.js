const CACHE_NAME = "life-tracker-cache-v1";
const FILES_TO_CACHE = [
  "/", "/index.html", "/style.css", "/app.js",
  // add manifest and icons if you host them
];

self.addEventListener("install", evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", evt => {
  evt.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", evt => {
  // simple cache-first strategy
  evt.respondWith(
    caches.match(evt.request).then(resp => resp || fetch(evt.request))
  );
});

self.addEventListener("notificationclick", function(event){
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
