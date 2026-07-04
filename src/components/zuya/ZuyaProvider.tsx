"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createZuyaClient } from "@/lib/supabase/zuya-client";
import type { ZuyaMemberRow } from "@/types/zuya";

// Tables whose postgres_changes events are multiplexed through the single
// "zuya" channel. Components subscribe with useZuyaTableEvent(table, cb) —
// one websocket topic total, which matters on phones.
const LIVE_TABLES = [
  "zuya_members",
  "zuya_thoughts",
  "zuya_messages",
  "zuya_date_suggestions",
  "zuya_notifications",
  "zuya_daily_answers",
  "zuya_bucket_list",
  "zuya_wordle_results",
] as const;

export type ZuyaLiveTable = (typeof LIVE_TABLES)[number];

type TableListener = (payload: { eventType: string; new?: unknown; old?: unknown }) => void;

interface ZuyaCtx {
  supabase: ReturnType<typeof createZuyaClient>;
  me: ZuyaMemberRow;
  partner: ZuyaMemberRow;
  /** user_id -> signed avatar URL (null while loading / no avatar). */
  avatars: Record<string, string | null>;
  refreshAvatar: (userId: string) => void;
  unreadMessages: number;
  unreadNotifications: number;
  subscribe: (table: ZuyaLiveTable, cb: TableListener) => () => void;
}

const Ctx = createContext<ZuyaCtx | null>(null);

export function useZuya(): ZuyaCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useZuya must be used inside <ZuyaProvider>");
  return ctx;
}

/** Subscribe to realtime changes on one zuya table. RLS scopes payloads, and
 * blind-reveal tables may deliver events with no visible row — treat events
 * as refetch signals, not as data. */
export function useZuyaTableEvent(table: ZuyaLiveTable, cb: TableListener) {
  const { subscribe } = useZuya();
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(
    () => subscribe(table, (p) => cbRef.current(p)),
    [subscribe, table],
  );
}

export function ZuyaProvider({
  initialMe,
  initialPartner,
  children,
}: {
  initialMe: ZuyaMemberRow;
  initialPartner: ZuyaMemberRow;
  children: ReactNode;
}) {
  const supabase = useMemo(() => createZuyaClient(), []);
  const [members, setMembers] = useState<Record<string, ZuyaMemberRow>>({
    [initialMe.user_id]: initialMe,
    [initialPartner.user_id]: initialPartner,
  });
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const meId = initialMe.user_id;
  const partnerId = initialPartner.user_id;

  const listeners = useRef<Map<ZuyaLiveTable, Set<TableListener>>>(new Map());
  const subscribe = useCallback((table: ZuyaLiveTable, cb: TableListener) => {
    let set = listeners.current.get(table);
    if (!set) {
      set = new Set();
      listeners.current.set(table, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
    };
  }, []);

  // -- Avatars: signed URLs from the private `zuya` bucket -------------------
  const loadAvatar = useCallback(
    async (userId: string, hasAvatar: boolean) => {
      if (!hasAvatar) {
        setAvatars((a) => ({ ...a, [userId]: null }));
        return;
      }
      const { data } = await supabase.storage
        .from("zuya")
        .createSignedUrl(`avatars/${userId}`, 60 * 60 * 24 * 7);
      setAvatars((a) => ({ ...a, [userId]: data?.signedUrl ?? null }));
    },
    [supabase],
  );

  const refreshAvatar = useCallback(
    (userId: string) => {
      void loadAvatar(userId, true);
    },
    [loadAvatar],
  );

  useEffect(() => {
    void loadAvatar(meId, !!initialMe.avatar_updated_at);
    void loadAvatar(partnerId, !!initialPartner.avatar_updated_at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Unread counts ----------------------------------------------------------
  const recountUnread = useCallback(async () => {
    const [{ count: msgs }, { count: notifs }] = await Promise.all([
      supabase
        .from("zuya_messages")
        .select("id", { count: "exact", head: true })
        .neq("sender_id", meId)
        .is("read_at", null),
      supabase
        .from("zuya_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", meId)
        .is("read_at", null),
    ]);
    setUnreadMessages(msgs ?? 0);
    setUnreadNotifications(notifs ?? 0);
  }, [supabase, meId]);

  useEffect(() => {
    void recountUnread();
  }, [recountUnread]);

  // -- The single multiplexed realtime channel -------------------------------
  useEffect(() => {
    let channel = supabase.channel("zuya");
    for (const table of LIVE_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (table === "zuya_members") {
            const row = payload.new as ZuyaMemberRow | undefined;
            if (row?.user_id) {
              setMembers((m) => {
                const prev = m[row.user_id];
                const next = { ...m, [row.user_id]: row };
                // Re-sign the avatar URL when it changed.
                if (row.avatar_updated_at !== prev?.avatar_updated_at) {
                  void loadAvatar(row.user_id, !!row.avatar_updated_at);
                }
                return next;
              });
            }
          }
          if (table === "zuya_messages" || table === "zuya_notifications") {
            void recountUnread();
          }
          const set = listeners.current.get(table);
          if (set) for (const cb of set) cb(payload as Parameters<TableListener>[0]);
        },
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, loadAvatar, recountUnread]);

  const me = members[meId] ?? initialMe;
  const partner = members[partnerId] ?? initialPartner;

  const value = useMemo<ZuyaCtx>(
    () => ({
      supabase,
      me,
      partner,
      avatars,
      refreshAvatar,
      unreadMessages,
      unreadNotifications,
      subscribe,
    }),
    [supabase, me, partner, avatars, refreshAvatar, unreadMessages, unreadNotifications, subscribe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
