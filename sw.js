// Service worker: guarda la "cáscara" de la app para abrirla rápido. Los datos siempre vienen de internet (Supabase).
const CACHE = 'emporio-v2';
const SHELL = ['./', './index.html', './pantalla.html', './styles.css', './config.js', './app.js', './chat.js', './horario.js', './mas.js', './admin.js',
  './vendor/supabase.js', './vendor/jsQR.js', './vendor/qrcode.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/logo-full.png', './icons/logo-mark.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // Supabase y demás: directo a la red
  // Red primero (para recibir actualizaciones), caché si no hay internet
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
