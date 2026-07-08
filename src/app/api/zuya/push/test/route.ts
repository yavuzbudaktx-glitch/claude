import { NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";

export const dynamic = "force-dynamic";

// Sends a test push to YOURSELF and reports exactly what happened, so push can
// be diagnosed without server access: are the VAPID keys set, is this device
// subscribed, and did the delivery succeed?
export async function POST() {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    return NextResponse.json({
      ok: false,
      reason: "no_vapid",
      message:
        "Sunucuda VAPID anahtarları eksik. Vercel env'e NEXT_PUBLIC_VAPID_PUBLIC_KEY ve VAPID_PRIVATE_KEY ekleyip yeniden deploy et.",
    });
  }
  webpush.setVapidDetails("mailto:yavuzbudaktx@gmail.com", pub, priv);

  const service = createServiceClient();
  const { data: subs } = await service
    .from("zuya_push_subs")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", auth.userId);

  if (!subs?.length) {
    return NextResponse.json({
      ok: false,
      reason: "no_subscription",
      message:
        "Bu cihaz kayıtlı değil. Önce 'Bildirimleri aç'a bas (iPhone'da uygulamayı Ana Ekrana ekleyip öyle aç).",
    });
  }

  const payload = JSON.stringify({
    title: "Zuya",
    body: "Test bildirimi 🔔 — çalışıyor!",
    url: "/zuya",
    tag: "zuya-test",
  });

  let sent = 0;
  let lastError: string | null = null;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent += 1;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        lastError = `${code ?? "?"} ${(e as Error).message ?? ""}`.trim();
        if (code === 404 || code === 410) {
          await service.from("zuya_push_subs").delete().eq("id", s.id);
        }
      }
    }),
  );

  if (sent > 0) {
    return NextResponse.json({
      ok: true,
      reason: "sent",
      message: `Test gönderildi (${sent} cihaz). Birazdan bildirim gelmeli.`,
    });
  }
  return NextResponse.json({
    ok: false,
    reason: "send_failed",
    message: `Gönderilemedi. Kayıt silinmiş olabilir — Bildirimleri kapatıp tekrar aç. (${lastError ?? "bilinmeyen hata"})`,
  });
}
