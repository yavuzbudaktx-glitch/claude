/// <reference lib="webworker" />
// Custom service-worker code, compiled and imported into the next-pwa service
// worker. Delivers web push for BOTH apps in this project — Zuya and Rest Area —
// so notifications arrive with the app closed.
//
// Nothing here is app-specific by name: the icon and the click target are both
// derived from the destination URL carried in the payload. The previous version
// hardcoded Zuya, which meant a Rest Area notification wore Zuya's icon and, if
// a Zuya tab happened to be open, clicking it focused that tab instead of going
// where the notification pointed.

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

function isZuya(url: string): boolean {
  return url.startsWith("/zuya") || url.includes("/zuya");
}

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const url = payload.url || "/dashboard";
  const zuya = isZuya(url);
  const icon = zuya ? "/icons/zuya-192.png" : "/icons/icon-192.png";
  const title = payload.title || (zuya ? "Zuya" : "Rest Area");

  const options: NotificationOptions = {
    body: payload.body || "",
    icon,
    badge: icon,
    tag: payload.tag,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url: string = (event.notification.data && event.notification.data.url) || "/dashboard";
  // Prefer an already-open window for the SAME app, and navigate it to the exact
  // destination. Only open a new window when nothing suitable is running.
  const wantZuya = isZuya(url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (isZuya(c.url) !== wantZuya) continue;
        if ("focus" in c) {
          const navigable = c as WindowClient;
          if (typeof navigable.navigate === "function") {
            return navigable.navigate(url).then((n) => (n ?? navigable).focus());
          }
          return navigable.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

export {};
