
const CACHE_NAME = 'jeoahs-marketplace-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/plans.html',
  '/referral.html',
  '/contact.html',
  '/faq.html',
  '/about.html',
  '/auth.html',
  '/manifest.json',
  '/assets/logo.png',
  // Ajoutez ici d'autres ressources statiques importantes
];

// Étape 1: Installation du Service Worker et mise en cache des ressources clés
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Étape 2: Activation du Service Worker et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Étape 3: Servir les requêtes - Stratégie "Cache First"
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Si la ressource est dans le cache, on la retourne
        if (response) {
          return response;
        }

        // Sinon, on la récupère sur le réseau
        return fetch(event.request).then(
          (networkResponse) => {
            // Et on la met en cache pour la prochaine fois
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            });
          }
        ).catch(() => {
            // Gérer les cas où la requête fetch échoue (par exemple, mode hors ligne)
            // Vous pouvez retourner une page hors-ligne générique ici si vous en avez une
        });
      })
  );
});
