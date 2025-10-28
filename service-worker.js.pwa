// service-worker.js
// Fichier nécessaire pour enregistrer la Progressive Web App (PWA)

const CACHE_NAME = 'jeoahs-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './auth.html',
  './affiliate_dashboard.html',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'
];

// Événement d'installation: Met en cache les fichiers de base
self.addEventListener('install', event => {
  console.log('[Service Worker] Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Mise en cache des ressources principales.');
        return cache.addAll(urlsToCache);
      })
  );
});

// Événement d'activation: Nettoie les anciens caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activation.');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[Service Worker] Suppression de l\'ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Événement fetch: Sert les ressources depuis le cache si possible, sinon réseau
self.addEventListener('fetch', event => {
  // Ignorer les requêtes API (Firebase, Google APIs) pour le cache
  if (event.request.url.includes('googleapis.com') || event.request.url.includes('gstatic.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - retourne la réponse du cache
        if (response) {
          return response;
        }
        // Pas dans le cache - va chercher sur le réseau
        return fetch(event.request);
      })
  );
});

