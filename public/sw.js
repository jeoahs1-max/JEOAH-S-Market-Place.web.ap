const CACHE_NAME = 'jeoahs-static-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/auth.html',
    '/dashboard.html',
    '/fonctionnalite.html',
    '/plans.html',
    '/about.html',
    '/contact.html',
    '/faq.html',
    '/terms.html',
    '/confidentialite.html',
    '/support.html',
    '/universal_chat_system.html',
    '/role_management.html',
    '/seller_setup.html',
    '/affiliate_setup_step1.html',
    '/buyer_setup.html',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response; // Serve from cache
                }
                return fetch(event.request); // Fetch from network
            })
    );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
