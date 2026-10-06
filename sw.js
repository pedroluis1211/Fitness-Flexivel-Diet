// sw.js — service worker do app.
// Objetivo: deixar o app inteiro (HTML/CSS/JS/ícones) disponível offline.
// A chamada à IA (api.anthropic.com) é sempre cross-origin e nunca é
// interceptada aqui, então continua exigindo internet normalmente.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `rumo-ao-natal-${CACHE_VERSION}`;

// Lista de arquivos do "app shell" para pré-cachear na instalação.
// Caminhos relativos para funcionar também quando publicado em subpasta
// (ex.: GitHub Pages em usuario.github.io/repositorio/).
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/app.js',
  './js/store.js',
  './js/utils.js',
  './js/settings.js',
  './js/today.js',
  './js/meals.js',
  './js/ai.js',
  './js/progress.js',
  './js/charts.js',
  './js/checklist.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca intercepta chamadas de outra origem (ex.: api.anthropic.com):
  // deixa o navegador lidar normalmente, exigindo internet para elas.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          // atualiza o cache em segundo plano (stale-while-revalidate)
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // offline: cai para o cache

      return cached || network;
    })
  );
});
