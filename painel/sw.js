// ============================================================
// SERVICE WORKER — CBP
// Cacheia a casca do app (offline-friendly). Dados sempre da rede.
// ============================================================
const CACHE = 'cbp-v1';
const CASCA = [
  '/painel/',
  '/painel/index.html',
  '/painel/css/app.css',
  '/painel/js/api.js',
  '/painel/js/ui.js',
  '/painel/js/telas.js',
  '/painel/js/telas2.js',
  '/painel/js/app.js',
  '/painel/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Chamadas de API: sempre rede (dados frescos)
  if (url.pathname.startsWith('/painel/api')) return;
  // Casca: cache primeiro, rede como reforco
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copia = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
