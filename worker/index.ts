/// <reference lib="webworker" />
// Custom service-worker code, compiled and imported into the next-pwa
// service worker. Handles web-push delivery for Zuya so the couple gets
// notified even when the app is closed.

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("push", (event: PushEvent) => {
  let payload: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title || "Zuya";
  const options: NotificationOptions = {
    body: payload.body || "",
    icon: "/icons/zuya-192.png",
    badge: "/icons/zuya-192.png",
    tag: payload.tag,
    data: { url: payload.url || "/zuya" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/zuya";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes("/zuya") && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

export {};
