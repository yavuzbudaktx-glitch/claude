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
import { QUEST_BY_ID } from "@/engine/quests";
import { RULES } from "@/engine/rules";
import { PRAYERS, PRAYER_LABELS } from "@/engine/types";
import { useNow } from "@/lib/useNow";
import { useGame } from "@/store/useGame";
import Dialog from "./Dialog";
import PixelIcon, { type IconName } from "./PixelIcon";
import UrgeModal from "./UrgeModal";

export function Card({ title, icon, right, children }: { title: string; icon?: IconName; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="flex items-center gap-1.5">
          {icon && <PixelIcon name={icon} size={12} color="#fff" />}
          {title}
        </span>
        {right}
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

const Streak = ({ n }: { n: number }) => (
  <span className="flex items-center gap-1 normal-case">
    <PixelIcon name="flame" size={11} color="#ffb347" />
    {n}
  </span>
);

function useToday() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const now = useNow();
  const day = game.days[dateKey(now)] ?? emptyDay(dateKey(now));
  return { game, act, now, day, streaks: liveStreaks(game, now) };
}

export function TodaySummary() {
  const { game, day } = useToday();
  const habits = activeCustom(game, day.date);
  const items = [
    ...PRAYERS.map((p) => day.prayers[p]),
    day.wake === "ok",
    day.diet === "on",
    ...habits.map((h) => !!day.custom[h.id]),
  ];
  const done = items.filter(Boolean).length;
  const quests = day.quests ?? [];
  const qDone = day.questsDone ?? [];
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-3 px-3 pt-2">
        <div className="font-pixel text-[11px]">TODAY</div>
        <div className="flex flex-1 gap-[3px]">
          {items.map((ok, k) => (
            <div key={k} className={`h-3 flex-1 rounded-[2px] border-2 border-black ${ok ? "bg-[#4caf50]" : "bg-[#d9d4c4]"}`} />
          ))}
        </div>
        <div className="font-pixel text-[11px] tabular-nums">
          {done}/{items.length}
        </div>
      </div>
      <div className="px-3 pb-2 pt-1 text-base text-[var(--muted)]">
        {day.relapses > 0 ? "Relapsed today. Tawbah, then back to it tomorrow." : done === items.length ? "Everything done. A perfect day if you stay clean." : "Tap the rug, the bed or the kitchen in your room, or use the cards below."}
      </div>
      {quests.length > 0 && (
        <div className="border-t-2 border-black bg-[var(--panel-2)] px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 font-pixel text-[9px] text-[var(--head-2)]">
            <PixelIcon name="scroll" size={11} color="var(--head-2)" /> DAILY QUESTS
          </div>
          <ul className="space-y-1">
            {quests.map((id) => {
              const q = QUEST_BY_ID[id];
              if (!q) return null;
              const ok = qDone.includes(id);
              return (
                <li key={id} className={`flex items-center justify-between gap-2 text-lg ${ok ? "text-[var(--good)]" : ""}`}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border-2 border-black ${ok ? "bg-[#4caf50]" : "bg-white"}`}>
                      {ok && <PixelIcon name="check" size={10} color="#fff" />}
                    </span>
                    <span className={ok ? "line-through decoration-2" : ""}>{q.text}</span>
                  </span>
                  <span className="chip shrink-0 bg-[var(--gold)] text-sm">+{q.coins}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

export function WakeCard() {
  const { game, act, now, day, streaks } = useToday();
  const win = wakeWindow(game, now);
  const deadline = formatHM(parseHM(game.settings.wakeTarget) + game.settings.wakeGraceMin);
  return (
    <Card title={`Wake up · ${game.settings.wakeTarget}`} icon="sun" right={<Streak n={streaks.wake} />}>
      {day.wake === "pending" ? (
        <>
          <p>
            Check in by <b>{deadline}</b>. Miss it and lose {RULES.wake.missCoins} coins and the streak.
          </p>
          <button
            className={`btn w-full py-2 text-xl ${win === "late" ? "btn-red" : "btn-green"}`}
            disabled={win === "too-early"}
            onClick={() =>
              act((s, n) => wakeCheckIn(s, n), win === "late" ? { kind: "late", say: "Overslept... tomorrow." } : { kind: "wake", say: "Good morning! Bismillah." })
            }
          >
            {win === "too-early" ? `Opens at 0${RULES.wakeEarliestHour}:00` : win === "late" ? `I'm up (late, -${RULES.wake.missCoins})` : "I'm up!"}
          </button>
        </>
      ) : (
        <p className={day.wake === "ok" ? "text-[var(--good)]" : "text-[var(--bad)]"}>
          {day.wake === "ok" ? "Up on time" : "Overslept"} at {day.wokeAt ? new Date(day.wokeAt).toTimeString().slice(0, 5) : "?"}
        </p>
      )}
    </Card>
  );
}

export function PrayersCard() {
  const { act, day, streaks } = useToday();
  const prayed = PRAYERS.filter((p) => day.prayers[p]).length;
  return (
    <Card title={`Prayers · ${prayed}/5`} icon="moon" right={<Streak n={streaks.prayers} />}>
      <div className="grid grid-cols-5 gap-1.5">
        {PRAYERS.map((p) => (
          <button
            key={p}
            className={`btn flex-col px-0 py-2 ${day.prayers[p] ? "btn-green" : ""}`}
            aria-pressed={day.prayers[p]}
            onClick={() =>
              act((s, n) => setPrayer(s, n, p, !day.prayers[p]), day.prayers[p] ? undefined : { kind: "pray", say: prayed === 4 ? "All 5! Alhamdulillah" : `${PRAYER_LABELS[p]}. Alhamdulillah` })
            }
          >
            <span className="text-lg">{PRAYER_LABELS[p]}</span>
            {day.prayers[p] ? <PixelIcon name="check" size={12} color="#fff" /> : <span className="h-3 text-base leading-3">·</span>}
          </button>
        ))}
      </div>
      <p className="text-base text-[var(--muted)]">Each unchecked prayer at midnight costs {RULES.prayer.missCoins}. All five earns a bonus.</p>
    </Card>
  );
}

export function PurityCard() {
  const { game, act, day, streaks } = useToday();
  const [urge, setUrge] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const toCar = Math.max(0, RULES.carCleanDays - streaks.clean);
  return (
    <Card title="Quit porn" icon="shield" right={<span className="normal-case">best {game.best.clean}</span>}>
      <div className="flex items-end gap-3">
        <div className="font-pixel text-4xl leading-none tabular-nums">{streaks.clean}</div>
        <div className="pb-0.5 text-base">
          days clean · {toCar > 0 ? `${toCar} more for the Ioniq 5` : "Ioniq 5 unlocked"}
        </div>
      </div>
      <div className="bar">
        <div className="h-full bg-[linear-gradient(#5b8fe0,#3d6fd1)]" style={{ width: `${Math.min(100, (streaks.clean / RULES.carCleanDays) * 100)}%` }} />
      </div>
      {day.urgesResisted > 0 && <p className="text-base">Urges beaten today: {day.urgesResisted}</p>}
      {day.relapses > 0 && <p className="text-base text-[var(--bad)]">Relapsed today. Tomorrow is day 1. Make tawbah and go again.</p>}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-blue py-2" onClick={() => setUrge(true)}>
          I feel an urge
        </button>
        <button className="btn btn-red py-2" onClick={() => setConfirm(true)}>
          I relapsed
        </button>
      </div>
      {urge && (
        <UrgeModal
          onClose={() => setUrge(false)}
          onResist={() => {
            act((s, n) => resistUrge(s, n), { kind: "urge", say: "Stayed strong!" });
            setUrge(false);
          }}
        />
      )}
      {confirm && (
        <Dialog title="Log relapse" onClose={() => setConfirm(false)}>
          <p>Strict mode. This will:</p>
          <ul className="list-disc pl-5 text-base">
            <li>Reset your clean streak to 0</li>
            <li>Cost {RULES.relapse.coins} coins (you can go into debt)</li>
            <li>Lock your newest item for {RULES.relapse.lockDays} clean days</li>
            <li>Make your room gloomy until a clean day</li>
          </ul>
          <p className="text-base">Being honest here is the discipline. It can&apos;t be undone.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              className="btn btn-red"
              onClick={() => {
                act((s, n) => relapse(s, n), { kind: "relapse", say: "Astaghfirullah. Again." });
                setConfirm(false);
              }}
            >
              Log it
            </button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

export function DietCard() {
  const { act, now, day, streaks } = useToday();
  const [meal, setMeal] = useState("");
  const log = (onPlan: boolean) => {
    act((s, n) => logMeal(s, n, meal, onPlan), onPlan ? { kind: "diet", say: "On plan!" } : { kind: "cheat", say: "Cheat meal..." });
    setMeal("");
  };
  return (
    <Card title="Diet" icon="plate" right={<Streak n={streaks.diet} />}>
      <form className="flex gap-1.5" onSubmit={(e) => (e.preventDefault(), log(true))}>
        <input id="meal-note" className="input min-w-0 flex-1" placeholder="What did you eat?" value={meal} onChange={(e) => setMeal(e.target.value)} />
        <button type="submit" className="btn btn-green">
          On plan
        </button>
        <button type="button" className="btn btn-red" onClick={() => log(false)}>
          Cheat
        </button>
      </form>
      {day.meals.length > 0 && (
        <ul className="space-y-0.5 text-base">
          {day.meals.map((m) => (
            <li key={m.at} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">
                {new Date(m.at).toTimeString().slice(0, 5)} · {m.note}
              </span>
              <span className={m.onPlan ? "text-[var(--good)]" : "text-[var(--bad)]"}>{m.onPlan ? "on plan" : "cheat"}</span>
            </li>
          ))}
        </ul>
      )}
      {day.diet === "cheat" ? (
        <p className="text-[var(--bad)]">Diet broken today. Reset tomorrow.</p>
      ) : day.diet === "on" ? (
        <p className="text-[var(--good)]">Checked in: stayed on plan today.</p>
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
  );
}

export function HabitsCard() {
  const { game, act, day } = useToday();
  const habits = activeCustom(game, day.date);
  if (!habits.length) return null;
  return (
    <Card title="Your habits" icon="star">
      {habits.map((h) => (
        <button
          key={h.id}
          className={`btn w-full justify-between py-2 ${day.custom[h.id] ? "btn-green" : ""}`}
          onClick={() => act((s, n) => setCustom(s, n, h.id, !day.custom[h.id]), day.custom[h.id] ? undefined : { kind: "habit", say: `${h.name}: done` })}
        >
          <span>{h.name}</span>
          <Streak n={(game.streaks.custom[h.id] ?? 0) + (day.custom[h.id] ? 1 : 0)} />
        </button>
      ))}
    </Card>
  );
}

export default function Today() {
  return (
    <div className="space-y-3">
      <TodaySummary />
      <WakeCard />
      <PrayersCard />
      <PurityCard />
      <DietCard />
      <HabitsCard />
    </div>
  );
}
