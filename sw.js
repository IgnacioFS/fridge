// Service worker: guarda la app en caché para que funcione sin conexión.
// Al cambiar cualquier archivo, sube CACHE_VERSION.
const CACHE_VERSION = 'fridge-v1.0.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/tokens.css', './css/base.css', './css/components.css', './css/views.css',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/icon-maskable-512.png',
  './js/app.js', './js/version.js',
  './js/domain/units.js', './js/domain/dates.js', './js/domain/catalog.js', './js/domain/matching.js',
  './js/domain/recipes.js', './js/domain/shopping.js', './js/domain/inventory.js', './js/domain/validation.js',
  './js/data/db.js', './js/data/store.js', './js/data/backup.js', './js/data/sample.js',
  './js/services/productLookup.js', './js/services/images.js', './js/services/barcode/ean.js', './js/services/barcode/scanner.js',
  './js/ui/dom.js', './js/ui/icons.js', './js/ui/components.js', './js/ui/platform.js',
  './js/ui/views/home.js', './js/ui/views/inventory.js', './js/ui/views/item-form.js', './js/ui/views/recipes.js',
  './js/ui/views/recipe-detail.js', './js/ui/views/recipe-form.js', './js/ui/views/shopping.js', './js/ui/views/scanner.js',
  './js/ui/views/settings.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' evita rellenar la caché nueva con archivos viejos de la caché HTTP.
  event.waitUntil(caches.open(CACHE_VERSION)
    .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Open Food Facts y demás: siempre red.
  // Navegación: index.html desde caché (la app es de una sola página).
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  // Caché primero, actualizando en segundo plano.
  const net = fetch(req).then(async (res) => {
    if (res.ok) { const copy = res.clone(); const c = await caches.open(CACHE_VERSION); await c.put(req, copy); }
    return res;
  });
  event.waitUntil(net.catch(() => {}));
  event.respondWith(caches.match(req).then((cached) => cached || net));
});
