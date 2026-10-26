"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { cloudStatus, onCloudStatus } from "@/lib/cloudSave";
import { addCustomHabit, archiveCustomHabit, isGameState, updateSettings } from "@/engine/engine";
import { dateKey } from "@/engine/dates";
import { getNow } from "@/lib/clock";
import { useGame } from "@/store/useGame";
import { SFX } from "@/lib/sound";
import Dialog from "./Dialog";
import PixelIcon from "./PixelIcon";

export default function Settings() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const replace = useGame((s) => s.replace);
  const reset = useGame((s) => s.reset);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [paste, setPaste] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const backupText = JSON.stringify(game);

  // Copy instead of download: downloads are blocked when the app runs inside claude.ai.
  const copyBackup = async () => {
    setShowBackup(true);
    try {
      await navigator.clipboard.writeText(backupText);
      setMsg(`Backup copied (${dateKey(getNow())}). Paste it into Notes to keep it safe.`);
    } catch {
      setMsg("Couldn't copy automatically. Select the text below and copy it.");
    }
  };

  const restore = (text: string) => {
    try {
      const data = JSON.parse(text);
      if (!isGameState(data)) throw new Error("bad backup");
      replace(data);
      setPaste("");
      setMsg("Backup restored.");
    } catch {
      setMsg("That isn't a Discipline Quest backup. Paste the full text you copied.");
    }
  };

  const toggleNotifications = async () => {
    if (game.settings.notifications) return act((s) => updateSettings(s, { notifications: false }));
    if (typeof Notification === "undefined") return setMsg("This browser doesn't support notifications.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setMsg("Notifications were blocked in the browser settings.");
    act((s) => updateSettings(s, { notifications: true }));
  };

  const habits = game.customHabits.filter((h) => !h.archived);

  return (
    <div className="space-y-3">
      <SaveStatus />
      <section className="panel">
        <div className="panel-head">Custom habits</div>
        <div className="space-y-2 p-3">
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              act((s, n) => addCustomHabit(s, n, name));
              setName("");
            }}
          >
            <input className="input min-w-0 flex-1" placeholder="e.g. Read 10 pages, Gym" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-green" disabled={!name.trim()}>
              Add
            </button>
          </form>
          <p className="text-base opacity-75">Daily. Each miss at midnight costs 5 coins, starting tomorrow.</p>
          {habits.map((h) => (
            <div key={h.id} className="flex items-center justify-between border-t border-black/15 pt-1.5">
              <span>{h.name}</span>
              <button className="btn" onClick={() => act((s, n) => archiveCustomHabit(s, n, h.id))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Schedule, reminders & sound</div>
        <div className="space-y-2 p-3">
          <label className="flex items-center justify-between gap-2">
            <span>Wake target</span>
            <input
              type="time"
              className="input"
              value={game.settings.wakeTarget}
              onChange={(e) => e.target.value && act((s) => updateSettings(s, { wakeTarget: e.target.value }))}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Grace minutes</span>
            <span className="text-lg">{game.settings.wakeGraceMin}</span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Bedtime</span>
            <input
              id="bedtime"
              type="time"
              className="input"
              value={game.settings.bedtime}
              onChange={(e) => e.target.value && act((s) => updateSettings(s, { bedtime: e.target.value }))}
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <span>Quran pages a day</span>
            <span className="flex items-center gap-1.5">
              <button className="btn h-9 w-9 px-0" disabled={game.settings.quranGoal <= 1} onClick={() => act((s) => updateSettings(s, { quranGoal: s.settings.quranGoal - 1 }))} aria-label="Fewer pages">
                −
              </button>
              <span className="w-6 text-center text-xl tabular-nums">{game.settings.quranGoal}</span>
              <button className="btn h-9 w-9 px-0" disabled={game.settings.quranGoal >= 20} onClick={() => act((s) => updateSettings(s, { quranGoal: s.settings.quranGoal + 1 }))} aria-label="More pages">
                +
              </button>
            </span>
          </div>
          <button className={`btn w-full py-2 ${game.settings.ramadan ? "btn-green" : ""}`} onClick={() => act((s) => updateSettings(s, { ramadan: !s.settings.ramadan }))}>
            <PixelIcon name="moon" size={14} /> Ramadan mode: {game.settings.ramadan ? "on" : "off"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className={`btn py-2 ${game.settings.notifications ? "btn-green" : ""}`} onClick={toggleNotifications}>
              Reminders: {game.settings.notifications ? "on" : "off"}
            </button>
            <button
              className={`btn py-2 ${game.settings.sound ? "btn-green" : ""}`}
              onClick={() => {
                const on = !game.settings.sound;
                act((s) => updateSettings(s, { sound: on }));
                if (on) SFX.good();
              }}
            >
              <PixelIcon name="sound" size={14} /> Sound: {game.settings.sound ? "on" : "off"}
            </button>
          </div>
          <p className="text-base opacity-75">
            Wake-up and 21:00 diet reminders fire while the app is open or recently backgrounded. Install it to your home screen for the best results.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Backup</div>
        <div className="space-y-2 p-3">
          <p className="text-base">An extra copy never hurts: copy a backup now and then and keep it in Notes.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-blue py-2" onClick={copyBackup}>
              Copy backup
            </button>
            <button className="btn py-2" onClick={() => file.current?.click()}>
              Restore from file
            </button>
          </div>
          {showBackup && (
            <textarea
              id="backup-out"
              readOnly
              className="input h-24 w-full font-mono text-xs"
              value={backupText}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
          <textarea
            id="backup-in"
            className="input h-20 w-full font-mono text-xs"
            placeholder="To restore, paste a backup here"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button className="btn w-full" disabled={!paste.trim()} onClick={() => restore(paste)}>
            Restore pasted backup
          </button>
          <input ref={file} type="file" accept="application/json,.json,.txt" className="hidden" onChange={async (e) => e.target.files?.[0] && restore(await e.target.files[0].text())} />
          {msg && <p className="text-base">{msg}</p>}
          <button className="btn btn-red w-full" onClick={() => setConfirmReset(true)}>
            Reset everything
          </button>
        </div>
      </section>

      {confirmReset && (
        <Dialog title="Reset" onClose={() => setConfirmReset(false)}>
          <p>Delete all progress, coins, streaks and items? This cannot be undone.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button
              className="btn btn-red"
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
            >
              Delete
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SaveStatus() {
  const c = useSyncExternalStore(onCloudStatus, cloudStatus, cloudStatus);
  const when = c.savedAt ? new Date(c.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className={`chip block ${c.mode === "cloud" && !c.error ? "bg-[#d9f0d9]" : "bg-[#ffe680]"}`}>
      {c.mode === "cloud" ? `Saved to your Claude account ✓${when ? ` (last saved ${when})` : ""}` : "Saving only on this device. Copy a backup now and then."}
      {c.error && <div>{c.error}</div>}
    </div>
  );
}
