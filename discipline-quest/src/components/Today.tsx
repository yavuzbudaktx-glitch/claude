"use client";
import { useState, type ReactNode } from "react";
import {
  activeCustom,
  dietCheckIn,
  dietCheckInOpen,
  emptyDay,
  liveStreaks,
  logMeal,
  relapse,
  resistUrge,
  setCustom,
  setPrayer,
  wakeCheckIn,
  wakeWindow,
} from "@/engine/engine";
import { dateKey, formatHM, parseHM } from "@/engine/dates";
import { RULES } from "@/engine/rules";
import { PRAYERS, PRAYER_LABELS } from "@/engine/types";
import { useNow } from "@/lib/useNow";
import { useGame } from "@/store/useGame";
import Dialog from "./Dialog";
import UrgeModal from "./UrgeModal";

function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <span>{title}</span>
        {right}
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

const Streak = ({ n }: { n: number }) => <span className="normal-case">🔥 {n}</span>;

export default function Today() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const now = useNow();
  const day = game.days[dateKey(now)] ?? emptyDay(dateKey(now));
  const streaks = liveStreaks(game, now);
  const [urge, setUrge] = useState(false);
  const [confirmRelapse, setConfirmRelapse] = useState(false);
  const [meal, setMeal] = useState("");

  const win = wakeWindow(game, now);
  const deadline = formatHM(parseHM(game.settings.wakeTarget) + game.settings.wakeGraceMin);
  const prayed = PRAYERS.filter((p) => day.prayers[p]).length;
  const habits = activeCustom(game, day.date);

  return (
    <div className="space-y-3">
      <Card title={`Wake up · ${game.settings.wakeTarget}`} right={<Streak n={streaks.wake} />}>
        {day.wake === "pending" ? (
          <>
            <p>
              Check in by <b>{deadline}</b>. Miss it and lose {RULES.wake.missCoins} coins and the streak.
            </p>
            <button
              className={`btn w-full py-2 text-xl ${win === "late" ? "btn-red" : "btn-green"}`}
              disabled={win === "too-early"}
              onClick={() =>
                act((s, n) => wakeCheckIn(s, n), win === "late"
                  ? { kind: "late", say: "Overslept... tomorrow." }
                  : { kind: "wake", say: "Good morning! Bismillah." })
              }
            >
              {win === "too-early" ? `Opens at 0${RULES.wakeEarliestHour}:00` : win === "late" ? `I'm up (late, -${RULES.wake.missCoins})` : "I'm up!"}
            </button>
          </>
        ) : (
          <p className={day.wake === "ok" ? "text-[#1e7d32]" : "text-[#b0302c]"}>
            {day.wake === "ok" ? "Up on time" : "Overslept"} at {day.wokeAt ? new Date(day.wokeAt).toTimeString().slice(0, 5) : "?"}
          </p>
        )}
      </Card>

      <Card title={`Prayers · ${prayed}/5`} right={<Streak n={streaks.prayers} />}>
        <div className="grid grid-cols-5 gap-1.5">
          {PRAYERS.map((p) => (
            <button
              key={p}
              className={`btn flex-col px-0 py-2 ${day.prayers[p] ? "btn-green" : ""}`}
              aria-pressed={day.prayers[p]}
              onClick={() =>
                act((s, n) => setPrayer(s, n, p, !day.prayers[p]),
                  day.prayers[p] ? undefined : { kind: "pray", say: prayed === 4 ? "All 5! Alhamdulillah" : `${PRAYER_LABELS[p]} done` })
              }
            >
              <span className="text-lg">{PRAYER_LABELS[p]}</span>
              <span className="text-base">{day.prayers[p] ? "✓" : "·"}</span>
            </button>
          ))}
        </div>
        <p className="text-base opacity-75">
          Unchecked prayers at midnight cost {RULES.prayer.missCoins} each. All 5 for {RULES.ponyPrayerDays} days in a row unlocks the pony.
        </p>
      </Card>

      <Card title="Quit porn" right={<span className="normal-case">{streaks.clean} clean days</span>}>
        <div className="flex items-end gap-3">
          <div className="font-pixel text-4xl leading-none">{streaks.clean}</div>
          <div className="pb-0.5 text-base">
            days clean · best {game.best.clean} · {Math.max(0, RULES.carCleanDays - streaks.clean)} to the convertible
          </div>
        </div>
        {day.urgesResisted > 0 && <p className="text-base">Urges beaten today: {day.urgesResisted}</p>}
        {day.relapses > 0 && <p className="text-base text-[#b0302c]">Relapsed today. Tomorrow is day 1. Make tawbah and go again.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-blue py-2" onClick={() => setUrge(true)}>
            I feel an urge
          </button>
          <button className="btn btn-red py-2" onClick={() => setConfirmRelapse(true)}>
            I relapsed
          </button>
        </div>
      </Card>

      <Card title="Diet" right={<Streak n={streaks.diet} />}>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <input className="input min-w-0 flex-1" placeholder="What did you eat?" value={meal} onChange={(e) => setMeal(e.target.value)} />
          <button
            type="button"
            className="btn btn-green"
            onClick={() => {
              act((s, n) => logMeal(s, n, meal, true), { kind: "diet", say: "On plan!" });
              setMeal("");
            }}
          >
            On plan
          </button>
          <button
            type="button"
            className="btn btn-red"
            onClick={() => {
              act((s, n) => logMeal(s, n, meal, false), { kind: "cheat", say: "Cheat meal..." });
              setMeal("");
            }}
          >
            Cheat
          </button>
        </form>
        {day.meals.length > 0 && (
          <ul className="space-y-0.5 text-base">
            {day.meals.map((m) => (
              <li key={m.at} className="flex justify-between">
                <span>
                  {new Date(m.at).toTimeString().slice(0, 5)} · {m.note}
                </span>
                <span className={m.onPlan ? "text-[#1e7d32]" : "text-[#b0302c]"}>{m.onPlan ? "on plan" : "cheat"}</span>
              </li>
            ))}
          </ul>
        )}
        {day.diet === "cheat" ? (
          <p className="text-[#b0302c]">Diet broken today. Reset tomorrow.</p>
        ) : day.diet === "on" ? (
          <p className="text-[#1e7d32]">Checked in: stayed on plan today.</p>
        ) : (
          <button
            className="btn btn-green w-full py-2"
            disabled={!dietCheckInOpen(now)}
            onClick={() => act((s, n) => dietCheckIn(s, n), { kind: "diet", say: "Clean eating today!" })}
          >
            {dietCheckInOpen(now) ? "I stayed on plan today" : `Evening check-in opens at ${RULES.diet.checkInFromHour}:00`}
          </button>
        )}
      </Card>

      {habits.length > 0 && (
        <Card title="Your habits">
          {habits.map((h) => (
            <button
              key={h.id}
              className={`btn w-full justify-between py-2 ${day.custom[h.id] ? "btn-green" : ""}`}
              onClick={() =>
                act((s, n) => setCustom(s, n, h.id, !day.custom[h.id]),
                  day.custom[h.id] ? undefined : { kind: "habit", say: `${h.name} ✓` })
              }
            >
              <span>{h.name}</span>
              <span>
                {day.custom[h.id] ? "✓" : "·"} 🔥{(game.streaks.custom[h.id] ?? 0) + (day.custom[h.id] ? 1 : 0)}
              </span>
            </button>
          ))}
        </Card>
      )}

      {urge && (
        <UrgeModal
          onClose={() => setUrge(false)}
          onResist={() => {
            act((s, n) => resistUrge(s, n), { kind: "urge", say: "Stayed strong!" });
            setUrge(false);
          }}
        />
      )}
      {confirmRelapse && (
        <Dialog title="Log relapse" onClose={() => setConfirmRelapse(false)}>
          <p>Strict mode. This will:</p>
          <ul className="list-disc pl-5 text-base">
            <li>Reset your clean streak to 0</li>
            <li>Cost {RULES.relapse.coins} coins (you can go into debt)</li>
            <li>Lock your newest item for {RULES.relapse.lockDays} clean days</li>
            <li>Make your room gloomy until a clean day</li>
          </ul>
          <p className="text-base">Being honest here is the discipline. It cannot be undone.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" onClick={() => setConfirmRelapse(false)}>
              Cancel
            </button>
            <button
              className="btn btn-red"
              onClick={() => {
                act((s, n) => relapse(s, n), { kind: "relapse", say: "Astaghfirullah. Again." });
                setConfirmRelapse(false);
              }}
            >
              Log it
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
