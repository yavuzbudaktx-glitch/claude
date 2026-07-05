"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Navigation, Loader2 } from "lucide-react";
import type * as L from "leaflet";
import { Card } from "@/components/Card";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import { OWNER_COLORS } from "@/components/zuya/calendar/MonthGrid";
import type { ZuyaUsername } from "@/lib/zuya/config";

interface Loc {
  user_id: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  sharing: boolean;
  updated_at: string;
}

function pinIcon(Lib: typeof L, color: string, letter: string) {
  return Lib.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-100%)"><div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:grid;place-items:center"><span style="transform:rotate(45deg);color:#fff;font-weight:700;font-size:12px">${letter}</span></div></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m}dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa önce`;
  return `${Math.floor(h / 24)}g önce`;
}

// Haversine distance in km.
function distanceKm(a: Loc, b: Loc): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function LocationCard() {
  const { supabase, me, partner } = useZuya();
  const [locs, setLocs] = useState<Record<string, Loc>>({});
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [ready, setReady] = useState(false); // map instance exists

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const libRef = useRef<typeof L | null>(null);
  const markers = useRef<Record<string, L.Marker>>({});
  const watchId = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("zuya_locations").select("*");
    if (error) {
      setDbError(
        /relation .*does not exist|schema cache|not exist/i.test(error.message)
          ? "Konum tablosu yok — Supabase'de 0015_zuya_locations.sql migration'ını çalıştır."
          : error.message,
      );
      return;
    }
    setDbError(null);
    const map: Record<string, Loc> = {};
    for (const r of (data as Loc[]) ?? []) map[r.user_id] = r;
    setLocs(map);
    if (map[me.user_id]) setSharing(map[me.user_id].sharing);
  }, [supabase, me.user_id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime updates for both pins.
  useEffect(() => {
    const ch = supabase
      .channel("zuya-locations")
      .on("postgres_changes", { event: "*", schema: "public", table: "zuya_locations" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [supabase, load]);

  // Init the Leaflet map (client-only, lazy import to avoid SSR window access).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const Lib = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || mapRef.current) return;
      libRef.current = Lib;
      const map = Lib.map(mapEl.current, { zoomControl: true, attributionControl: false }).setView([39, 35], 5);
      Lib.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      // Leaflet needs its size recomputed once the container has painted (and
      // again after the card's fade-in), or tiles render half/grey.
      const fix = () => map.invalidateSize();
      setTimeout(fix, 60);
      setTimeout(fix, 400);
      // Signal that the map exists so the marker-sync effect runs with the
      // location data that may have already loaded (fixes the init race).
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncMarkers = useCallback(() => {
    const Lib = libRef.current;
    const map = mapRef.current;
    if (!Lib || !map) return;
    const pts: L.LatLngExpression[] = [];
    for (const [uid, loc] of Object.entries(locs)) {
      const isMe = uid === me.user_id;
      const username = (isMe ? me.username : partner.username) as ZuyaUsername;
      const name = isMe ? me.display_name : partner.display_name;
      if (loc.sharing && loc.lat != null && loc.lng != null) {
        pts.push([loc.lat, loc.lng]);
        const existing = markers.current[uid];
        if (existing) {
          existing.setLatLng([loc.lat, loc.lng]);
        } else {
          markers.current[uid] = Lib.marker([loc.lat, loc.lng], {
            icon: pinIcon(Lib, OWNER_COLORS[username], name.charAt(0)),
          }).addTo(map);
        }
      } else if (markers.current[uid]) {
        markers.current[uid].remove();
        delete markers.current[uid];
      }
    }
    map.invalidateSize();
    if (pts.length === 1) map.setView(pts[0], 14);
    else if (pts.length > 1) map.fitBounds(Lib.latLngBounds(pts).pad(0.4));
  }, [locs, me.user_id, me.username, me.display_name, partner.username, partner.display_name]);

  useEffect(() => {
    if (ready) syncMarkers();
  }, [syncMarkers, ready]);

  async function toggleShare() {
    if (sharing) {
      // Stop sharing.
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setSharing(false);
      setStatus(null);
      await supabase
        .from("zuya_locations")
        .upsert({ user_id: me.user_id, sharing: false }, { onConflict: "user_id" });
      return;
    }
    if (!navigator.geolocation) {
      setStatus("Bu cihaz konum desteklemiyor.");
      return;
    }
    setStatus("Konum alınıyor…");
    setSharing(true);
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setStatus(null);
        setMyCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        const { error } = await supabase.from("zuya_locations").upsert(
          {
            user_id: me.user_id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            sharing: true,
          },
          { onConflict: "user_id" },
        );
        if (error) {
          setDbError(
            /relation .*does not exist|schema cache|not exist/i.test(error.message)
              ? "Konum tablosu yok — Supabase'de 0015_zuya_locations.sql migration'ını çalıştır."
              : `Kaydedilemedi: ${error.message}`,
          );
        } else {
          setDbError(null);
          void load(); // draw my pin now, don't wait on realtime
        }
      },
      (err) => {
        setSharing(false);
        setStatus(err.code === err.PERMISSION_DENIED ? "Konum izni verilmedi." : "Konum alınamadı.");
        if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
  }

  // Stop the watcher when the card unmounts.
  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  const partnerLoc = locs[partner.user_id];
  const myLoc = locs[me.user_id];
  const dist = myLoc && partnerLoc && myLoc.sharing && partnerLoc.sharing ? distanceKm(myLoc, partnerLoc) : null;

  return (
    <Card id="zuya-location-card" title="Neredeyiz" collapsible={false}>
      {dbError && (
        <p className="mb-2 rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--down)_10%,transparent)] text-[12px] text-down break-words">
          {dbError}
        </p>
      )}
      <div className="rounded-2xl overflow-hidden border border-[var(--rule-soft)]">
        <div ref={mapEl} style={{ height: 260, width: "100%", background: "var(--rule-soft)" }} />
      </div>
      {myCoords && (
        <p className="text-[11px] text-muted-2 mt-1.5 font-mono">
          konumun: {myCoords.lat.toFixed(5)}, {myCoords.lng.toFixed(5)}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
        <div className="text-[12px] text-muted space-y-0.5">
          <div className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: OWNER_COLORS[me.username] }} />
            {sharing ? "paylaşıyorsun" : "kapalı"}
          </div>
          <div className="inline-flex items-center gap-1.5 ml-3">
            <span className="h-2 w-2 rounded-full" style={{ background: OWNER_COLORS[partner.username] }} />
            {partnerLoc?.sharing && partnerLoc.lat != null
              ? `${partner.display_name} · ${timeAgo(partnerLoc.updated_at)}`
              : `${partner.display_name} paylaşmıyor`}
          </div>
          {dist != null && (
            <div className="text-ink-soft font-medium pt-0.5">
              {dist < 1 ? `${Math.round(dist * 1000)} m arada` : `${dist.toFixed(1)} km arada`}
            </div>
          )}
        </div>

        <button
          onClick={toggleShare}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold transition ${
            sharing
              ? "border border-[var(--rule)] text-muted hover:text-down hover:border-[var(--down)]"
              : "text-white hover:brightness-110"
          }`}
          style={sharing ? undefined : { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
        >
          {status === "Konum alınıyor…" ? <Loader2 className="h-4 w-4 animate-spin" /> : sharing ? <MapPin className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
          {sharing ? "Paylaşımı durdur" : "Konumumu paylaş"}
        </button>
      </div>

      {status && status !== "Konum alınıyor…" && (
        <p className="text-[12px] text-down mt-2">{status}</p>
      )}
      <p className="text-[11px] text-muted-2 mt-2">
        Konum yalnızca uygulama açıkken ve paylaşım açıkken güncellenir.
      </p>
    </Card>
  );
}
