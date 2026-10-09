"use client";
import { useRef, useState } from "react";
import { addCustomHabit, archiveCustomHabit, isGameState, updateSettings } from "@/engine/engine";
import { dateKey } from "@/engine/dates";
import { getNow } from "@/lib/clock";
import { useGame } from "@/store/useGame";
import Dialog from "./Dialog";

export default function Settings() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const replace = useGame((s) => s.replace);
  const reset = useGame((s) => s.reset);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(game, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `discipline-quest-${dateKey(getNow())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!isGameState(data)) throw new Error("bad file");
      replace(data);
      setMsg("Backup restored.");
    } catch {
      setMsg("That file isn't a Discipline Quest backup.");
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
        <div className="panel-head">Wake-up & reminders</div>
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
          <button className={`btn w-full py-2 ${game.settings.notifications ? "btn-green" : ""}`} onClick={toggleNotifications}>
            Reminders: {game.settings.notifications ? "on" : "off"}
          </button>
          <p className="text-base opacity-75">
            Wake-up and 21:00 diet reminders fire while the app is open or recently backgrounded. Install it to your home screen for the best results.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Backup</div>
        <div className="space-y-2 p-3">
          <p className="text-base">Your data lives only on this device. Export a backup now and then.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-blue py-2" onClick={exportData}>
              Export
            </button>
            <button className="btn py-2" onClick={() => file.current?.click()}>
              Import
            </button>
          </div>
          <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
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
