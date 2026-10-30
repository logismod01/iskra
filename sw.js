/* Искра — service worker.
   Задача: приложение открывается с телефона и компьютера даже без сети,
   а обновления подтягиваются, когда сеть есть.
   Стратегия: навигация — сеть, при обрыве кэш; статика — кэш, потом сеть. */

const VERSION = "iskra-1.7.0";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // по одному: если файла нет — установка всё равно состоится
    await Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // чужие API не кэшируем

  // Страницы: сначала сеть (свежая версия), при обрыве — сохранённая копия
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put("./index.html", fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cache = await caches.open(VERSION);
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Остальное: кэш, потом сеть (и кладём в кэш)
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === "basic") cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    } catch (e) {
      return new Response("", { status: 504, statusText: "offline" });
    }
  })());
});
