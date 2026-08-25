// Service Worker de Lito Barber Studio
// Permite que la app funcione sin conexión una vez instalada en el teléfono.
// Nota: los datos de citas y clientes viven en localStorage (no aquí), así que
// seguirán disponibles sin conexión sin importar lo que haga este archivo.

const CACHE_NAME = 'lito-barber-cache-v13';
const ARCHIVOS_APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './logo.png',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ARCHIVOS_APP_SHELL).catch(() => {
                // Si un archivo del shell no existe todavía, no bloquea la instalación
            }))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((nombres) =>
            Promise.all(
                nombres
                    .filter((nombre) => nombre !== CACHE_NAME)
                    .map((nombre) => caches.delete(nombre))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Solo maneja peticiones GET del mismo origen (evita interferir con WhatsApp, etc.)
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((respuestaCache) => {
            const fetchPromise = fetch(event.request)
                .then((respuestaRed) => {
                    if (respuestaRed && respuestaRed.status === 200 && respuestaRed.type === 'basic') {
                        const clone = respuestaRed.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return respuestaRed;
                })
                .catch(() => respuestaCache);

            // Estrategia "cache primero, luego red" para que la app abra al instante
            return respuestaCache || fetchPromise;
        })
    );
});
