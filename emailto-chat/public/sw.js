/* emailto.chat service worker — offline shell only.
 * Privacy: API responses (your mail) are NEVER cached. Only static assets and the offline page are.
 */
const VERSION = "etc-v1";
const SHELL = ["/offline", "/icons/192", "/icons/512"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache mail data

  // Navigations: network first, offline page as fallback.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;
  }

  // Immutable build assets: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// Prepared for Web Push (not yet sent by the server — see README → Roadmap).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "emailto.chat", body: event.data && event.data.text() };
  }
  // Notifications intentionally contain no message content unless the payload provides it.
  event.waitUntil(
    self.registration.showNotification(data.title || "New message", {
      body: data.body || "You have a new e-mail conversation update.",
      icon: "/icons/192",
      badge: "/icons/192",
      tag: data.tag || "etc-new-mail",
      data: { url: data.url || "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w && w.url.includes("/app")) return w.focus();
      return self.clients.openWindow(url);
    }),
  );
});
