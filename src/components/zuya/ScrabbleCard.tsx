"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/Card";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import {
  SIZE, RACK, CENTER, POINTS, freshBag, bonusAt, scoreMove,
  type Cell, type Placed,
} from "@/lib/zuya/scrabble";

interface Game {
  id: string;
  board: Cell[];
  bag: string[];
  racks: Record<string, string[]>;
  scores: Record<string, number>;
  turn: string | null;
  status: "active" | "done";
  passes: number;
  last_move: { by: string; words: string[]; points: number } | null;
}

const BONUS_STYLE: Record<string, { bg: string; label: string }> = {
  TW: { bg: "#b3362a", label: "K³" },
  DW: { bg: "#d4708f", label: "K²" },
  TL: { bg: "#2f6f8f", label: "H³" },
  DL: { bg: "#6fa8c7", label: "H²" },
};

export function ScrabbleCard() {
  const { supabase, me, partner } = useZuya();
  const [game, setGame] = useState<Game | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<Record<number, { l: string; b: boolean; rackIdx: number }>>({});
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chan = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("zuya_scrabble")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setGame((data as Game) ?? null);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime for the game row.
  useEffect(() => {
    const ch = supabase
      .channel("zuya-scrabble")
      .on("postgres_changes", { event: "*", schema: "public", table: "zuya_scrabble" }, () => {
        setPending({});
        setSel(null);
        void load();
      })
      .subscribe();
    chan.current = ch;
    return () => { void supabase.removeChannel(ch); };
  }, [supabase, load]);

  const myTurn = !!game && game.status === "active" && game.turn === me.user_id;
  const myRack = game?.racks?.[me.user_id] ?? [];
  const usedRackIdx = useMemo(() => new Set(Object.values(pending).map((p) => p.rackIdx)), [pending]);

  async function newGame() {
    setBusy(true);
    setMsg(null);
    try {
      const bag = freshBag();
      const mine = bag.splice(0, RACK);
      const theirs = bag.splice(0, RACK);
      const board: Cell[] = Array(SIZE * SIZE).fill(null);
      await supabase.from("zuya_scrabble").insert({
        board, bag,
        racks: { [me.user_id]: mine, [partner.user_id]: theirs },
        scores: { [me.user_id]: 0, [partner.user_id]: 0 },
        turn: me.user_id,
        status: "active",
        passes: 0,
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  function tapCell(idx: number) {
    if (!myTurn) return;
    if (game?.board[idx]) return; // committed tile
    if (pending[idx]) {
      const cp = { ...pending };
      delete cp[idx];
      setPending(cp);
      return;
    }
    if (sel === null) return;
    let letter = myRack[sel];
    let blank = false;
    if (letter === "*") {
      const ans = (window.prompt("Joker hangi harf olsun?") ?? "").toLocaleUpperCase("tr").trim();
      if (!ans || !(ans in POINTS) || ans === "*") return;
      letter = ans;
      blank = true;
    }
    setPending({ ...pending, [idx]: { l: letter, b: blank, rackIdx: sel } });
    setSel(null);
  }

  function recallAll() {
    setPending({});
    setSel(null);
  }

  async function submit() {
    if (!game || !myTurn) return;
    const placed: Placed[] = Object.entries(pending).map(([idx, p]) => ({
      idx: Number(idx), l: p.l, b: p.b,
    }));
    if (placed.length === 0) { setMsg("Önce taş koy."); return; }

    const merged = [...game.board];
    for (const p of placed) merged[p.idx] = { l: p.l, b: p.b, u: me.user_id };
    const firstMove = game.board.every((c) => !c);
    const res = scoreMove(merged, placed, firstMove);
    if (!res.ok) { setMsg(res.error ?? "Geçersiz hamle."); return; }

    setBusy(true);
    setMsg(null);
    try {
      // Remove used tiles from my rack, refill from the bag.
      const rack = [...myRack];
      const usedIdxs = Object.values(pending).map((p) => p.rackIdx).sort((a, b) => b - a);
      for (const i of usedIdxs) rack.splice(i, 1);
      const bag = [...game.bag];
      while (rack.length < RACK && bag.length > 0) rack.push(bag.shift()!);

      const scores = { ...game.scores, [me.user_id]: (game.scores[me.user_id] ?? 0) + res.points };
      await supabase
        .from("zuya_scrabble")
        .update({
          board: merged,
          bag,
          racks: { ...game.racks, [me.user_id]: rack },
          scores,
          turn: partner.user_id,
          passes: 0,
          last_move: { by: me.user_id, words: res.words, points: res.points },
        })
        .eq("id", game.id);
      setPending({});
      setSel(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function pass() {
    if (!game || !myTurn) return;
    setBusy(true);
    try {
      const passes = (game.passes ?? 0) + 1;
      await supabase
        .from("zuya_scrabble")
        .update({
          turn: partner.user_id,
          passes,
          status: passes >= 4 ? "done" : "active",
        })
        .eq("id", game.id);
      setPending({});
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return <Card title="Kelimelik" collapsible={false}><p className="text-muted text-sm">Yükleniyor…</p></Card>;
  }

  if (!game || game.status === "done") {
    return (
      <Card title="Kelimelik" collapsible={false}>
        {game?.status === "done" && (
          <p className="text-[13px] text-ink mb-3">
            Oyun bitti — {me.display_name} {game.scores[me.user_id] ?? 0} ·{" "}
            {partner.display_name} {game.scores[partner.user_id] ?? 0}
          </p>
        )}
        <p className="text-[13px] text-muted mb-3">İkiniz için sıra tabanlı Türkçe Scrabble. Sözlük yok — birbirinize güvenin.</p>
        <button
          onClick={newGame}
          disabled={busy}
          className="px-4 py-2.5 rounded-2xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
        >
          {busy ? "…" : "Yeni oyun"}
        </button>
      </Card>
    );
  }

  return (
    <Card title="Kelimelik" collapsible={false}>
      <div className="flex items-center justify-between mb-3 text-[13px]">
        <span className={`font-semibold ${myTurn ? "text-accent" : "text-ink"}`}>
          {me.display_name}: {game.scores[me.user_id] ?? 0}
        </span>
        <span className="label">
          {game.turn === me.user_id ? "sıra sende" : `sıra ${partner.display_name}'da`} · torba {game.bag.length}
        </span>
        <span className={`font-semibold ${game.turn === partner.user_id ? "text-accent" : "text-ink"}`}>
          {partner.display_name}: {game.scores[partner.user_id] ?? 0}
        </span>
      </div>

      {game.last_move && (
        <p className="text-[11.5px] text-muted-2 mb-2 text-center">
          son: {game.last_move.by === me.user_id ? "sen" : partner.display_name} ·{" "}
          {game.last_move.words.join(", ")} (+{game.last_move.points})
        </p>
      )}

      {/* Board */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div
          className="grid mx-auto"
          style={{ gridTemplateColumns: `repeat(${SIZE}, 22px)`, width: SIZE * 22, gap: 1 }}
        >
          {Array.from({ length: SIZE * SIZE }).map((_, idx) => {
            const committed = game.board[idx];
            const pend = pending[idx];
            const cell = committed ?? (pend ? { l: pend.l, b: pend.b } : null);
            const bonus = bonusAt(idx);
            const bs = BONUS_STYLE[bonus];
            const isCenter = idx === CENTER;
            return (
              <button
                key={idx}
                onClick={() => tapCell(idx)}
                className="relative grid place-items-center rounded-[3px] text-[11px] font-bold"
                style={{
                  width: 22, height: 22,
                  background: cell
                    ? pend ? "var(--accent)" : "var(--paper-2)"
                    : bs ? bs.bg : isCenter ? "var(--accent-soft)" : "var(--rule-soft)",
                  color: cell ? (pend ? "#fff" : "var(--ink)") : "#fff",
                  border: committed ? "1px solid var(--rule)" : "none",
                }}
              >
                {cell ? (
                  <>
                    <span>{cell.l}</span>
                    {!cell.b && (
                      <span className="absolute bottom-0 right-0.5 text-[6px] leading-none opacity-80">
                        {POINTS[cell.l] ?? ""}
                      </span>
                    )}
                  </>
                ) : bs ? (
                  <span className="text-[7px] opacity-90">{bs.label}</span>
                ) : isCenter ? "★" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* My rack */}
      <div className="mt-4">
        <div className="flex justify-center gap-1.5 flex-wrap">
          {myRack.map((t, i) => {
            const used = usedRackIdx.has(i);
            return (
              <button
                key={i}
                disabled={used || !myTurn}
                onClick={() => setSel(sel === i ? null : i)}
                className="relative grid place-items-center rounded-md text-[15px] font-bold transition"
                style={{
                  width: 34, height: 34,
                  background: used ? "var(--rule-soft)" : sel === i ? "var(--accent)" : "var(--paper-2)",
                  color: used ? "transparent" : sel === i ? "#fff" : "var(--ink)",
                  border: `1px solid ${sel === i ? "var(--accent)" : "var(--rule)"}`,
                  opacity: !myTurn ? 0.6 : 1,
                }}
              >
                {t === "*" ? "★" : t}
                {t !== "*" && !used && (
                  <span className="absolute bottom-0 right-0.5 text-[7px] leading-none opacity-70">
                    {POINTS[t] ?? ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {myTurn ? (
          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              onClick={submit}
              disabled={busy || Object.keys(pending).length === 0}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
            >
              Oyna
            </button>
            <button
              onClick={recallAll}
              disabled={Object.keys(pending).length === 0}
              className="px-3 py-2 rounded-xl text-[13px] border border-[var(--rule)] hover:border-[var(--accent)] transition disabled:opacity-40"
            >
              Geri al
            </button>
            <button
              onClick={pass}
              disabled={busy}
              className="px-3 py-2 rounded-xl text-[13px] text-muted hover:text-ink border border-[var(--rule)] transition"
            >
              Pas
            </button>
          </div>
        ) : (
          <p className="text-center text-[12.5px] text-muted mt-3">
            {partner.display_name}&apos;ın sırası…
          </p>
        )}

        {msg && <p className="text-center text-[12.5px] text-down mt-2">{msg}</p>}
      </div>
    </Card>
  );
}
