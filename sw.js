const CACHE_NAME = "chatly-settings-scroll-fix-20261031";
const STATIC_ASSETS = [
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("chatly-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) {
    event.respondWith(fetch(request));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      return fetch(request);
    })());
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; }
    catch { data = { title: "Chatly", body: event.data?.text?.() || "You have a new notification." }; }

    // When Chatly is already visible, its realtime in-app UI handles the event.
    // Avoid showing a duplicate system notification in that case.
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.some((client) => client.visibilityState === "visible")) return;

    const isCall = data.kind === "private-call" || data.kind === "group-call";
    const options = {
      body: data.body || "You have a new Chatly notification.",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: data.tag || `chatly-${Date.now()}`,
      renotify: true,
      requireInteraction: !!isCall,
      silent: false,
      data: {
        url: data.url || "./",
        kind: data.kind || "message",
        conversationId: data.conversationId || null,
        groupId: data.groupId || null,
        callId: data.callId || null
      }
    };
    if (isCall) options.vibrate = [500, 250, 500, 250, 900];
    await self.registration.showNotification(data.title || "Chatly", options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data || {};
    const url = new URL(data.url || "./", self.registration.scope).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        client.postMessage({ type: "CHATLY_NOTIFICATION_CLICK", data });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
