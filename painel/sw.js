// ============================================================
// SERVICE WORKER — AUTODESTRUTIVO
// ============================================================
// O painel deixou de ser um app instalavel (PWA) e voltou a ser
// somente dashboard no navegador. Este arquivo existe apenas para
// DESFAZER a instalacao anterior: quando o navegador buscar a versao
// nova do service worker, ele limpa todo o cache, se desregistra e
// recarrega as janelas abertas. Depois disso nao sobra nada.
// Nao remover este arquivo — sem ele, o app antigo continua instalado
// no computador com a versao velha em cache.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const chaves = await caches.keys();
      await Promise.all(chaves.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const janelas = await self.clients.matchAll({ type: 'window' });
      janelas.forEach((j) => j.navigate(j.url));
    } catch (e) { /* nada a fazer */ }
  })());
});

// Sem interceptar nada: tudo vai direto pra rede.
