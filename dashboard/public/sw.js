// Service worker básico: cachea SOLO el shell estático de la app (bundles de
// JS/CSS con hash de contenido, manifest, iconos). Los datos —cualquier
// petición a /api/ o el propio documento HTML, que en un Server Component
// lleva datos de la base de datos incrustados— NUNCA se cachean: se piden
// siempre en fresco, tal como pide el dashboard.

const SHELL_CACHE = "memoriable-shell-v1";
const SHELL_ASSETS = ["/manifest.webmanifest", "/icons/192", "/icons/512"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Peticiones a la API: siempre a la red, nunca interceptadas.
  if (url.pathname.startsWith("/api/")) return;

  // Bundles estáticos de Next (nombre de archivo con hash de contenido):
  // seguros de cachear de forma agresiva, cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Todo lo demás (el documento HTML, que lleva datos incrustados; RSC
  // payloads; etc.) no se intercepta: va directo a la red.
});

// Push notifications (Web Push estándar, VAPID) — ver lib/webPush.ts en el
// servidor. El payload es JSON plano: { title, body, link, tag }.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "MemorIAble", {
      body: payload.body,
      icon: "/icons/192",
      badge: "/icons/192",
      // `tag` agrupa: varios mensajes de la MISMA conversación sustituyen
      // al aviso anterior en vez de apilarse. `renotify` hace que aun así
      // avise (vibración/sonido) — si no, el reemplazo pasaría
      // desapercibido. Sin `tag` (asignaciones), cada aviso es
      // independiente, como hasta ahora.
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { link: payload.link || "/" },
    }),
  );
});

// Al pulsar el aviso: si ya hay una pestaña abierta, la enfoca y navega ahí
// dentro (sin abrir una segunda); si no, abre una nueva en el enlace.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(link);
          return;
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
