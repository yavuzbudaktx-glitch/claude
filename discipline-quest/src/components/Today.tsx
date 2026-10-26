"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CAR_UNLOCKS, ITEMS } from "@/engine/catalog";
import {
  BODY_NAMES,
  BODY_THRESHOLDS,
  activeCustom,
  bedCheckIn,
  bedKey,
  bedWindow,
  gymCountInWeek,
  isFriday,
  mondayOf,
  setFast,
  setGym,
  setQuranPages,
  setTaraweeh,
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
import { addDays, dateKey, formatHM, parseHM } from "@/engine/dates";
import { QUEST_BY_ID } from "@/engine/quests";
import { RULES } from "@/engine/rules";
import { PRAYERS, PRAYER_LABELS } from "@/engine/types";
import { useNow } from "@/lib/useNow";
import { useGame } from "@/store/useGame";
import Dialog from "./Dialog";
import PixelIcon, { type IconName } from "./PixelIcon";
import RasterCanvas from "./RasterCanvas";
import UrgeModal from "./UrgeModal";
import { renderAvatar, type BodyStage, type OutfitId } from "@/game/sprites/avatar";

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

/** Confetti the moment everything for today is done (once per page visit). */
function usePerfectParty(perfect: boolean) {
  const [party, setParty] = useState(0);
  const was = useRef(perfect);
  useEffect(() => {
    if (perfect && !was.current) {
      setParty(Date.now());
      const id = setTimeout(() => setParty(0), 2400);
      was.current = perfect;
      return () => clearTimeout(id);
    }
    was.current = perfect;
  }, [perfect]);
  return party;
}

export function TodaySummary() {
  const { game, day } = useToday();
  const habits = activeCustom(game, day.date);
  const items = [
    ...PRAYERS.map((p) => day.prayers[p]),
    day.wake === "ok",
    day.diet === "on",
    (day.quranPages ?? 0) >= game.settings.quranGoal,
    ...habits.map((h) => !!day.custom[h.id]),
  ];
  const done = items.filter(Boolean).length;
  const quests = day.quests ?? [];
  const qDone = day.questsDone ?? [];
  const party = usePerfectParty(done === items.length && day.relapses === 0);
  return (
    <section className="panel relative overflow-hidden">
      {party > 0 &&
        Array.from({ length: 26 }, (_, k) => (
          <span
            key={`${party}-${k}`}
            className="confetti pointer-events-none"
            style={{ left: `${(k * 37) % 100}%`, top: 0, background: ["#f6c744", "#ff4fc3", "#4caf50", "#3d86c6", "#ffffff"][k % 5], animationDelay: `${(k % 7) * 0.07}s` }}
          />
        ))}
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
      <div className="px-3 pb-2 pt-1 text-[14px] text-[var(--muted)]">
        {day.relapses > 0 ? "Relapsed today. Back to it tomorrow." : done === items.length ? "Everything done. A perfect day if you stay clean." : "Tap the rug, the bed or the kitchen in your room, or use the cards below."}
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
                <li key={id} className={`flex items-center justify-between gap-2 text-[15px] ${ok ? "text-[var(--good)]" : ""}`}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border-2 border-black ${ok ? "bg-[#4caf50]" : "bg-white"}`}>
                      {ok && <PixelIcon name="check" size={10} color="#fff" />}
                    </span>
                    <span className={ok ? "line-through decoration-2" : ""}>{q.text}</span>
                  </span>
                  <span className="chip shrink-0 bg-[var(--gold)] text-[12.5px]">+{q.coins}</span>
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
      {day.wake === "pending" && win === "missed" ? (
        <p className="text-[var(--bad)]">
          Missed this morning. It costs {RULES.wake.missCoins} at midnight. Tomorrow: check in by <b>{deadline}</b>.
        </p>
      ) : day.wake === "pending" ? (
        <>
          <p>
            Check in by <b>{deadline}</b>. Miss it and lose {RULES.wake.missCoins} coins and the streak.
          </p>
          <button
            className={`btn w-full py-2 text-[17px] ${win === "late" ? "btn-red" : "btn-green"}`}
            disabled={win === "too-early"}
            onClick={() =>
              act((s, n) => wakeCheckIn(s, n), win === "late" ? { kind: "late", say: "Overslept... tomorrow." } : { kind: "wake", say: "Alhamdulillah, good morning!" })
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
  const friday = isFriday(day.date);
  const label = (p: (typeof PRAYERS)[number]) => (p === "dhuhr" && friday ? "Jumu'ah" : PRAYER_LABELS[p]);
  return (
    <Card title={`Prayers · ${prayed}/5`} icon="moon" right={<Streak n={streaks.prayers} />}>
      <div className="grid grid-cols-5 gap-1.5">
        {PRAYERS.map((p) => (
          <button
            key={p}
            className={`btn flex-col px-0 py-2 ${day.prayers[p] ? "btn-green" : ""}`}
            aria-pressed={day.prayers[p]}
            onClick={() =>
              act((s, n) => setPrayer(s, n, p, !day.prayers[p]), day.prayers[p] ? undefined : { kind: "pray", say: prayed === 4 ? "Alhamdulillah, all five!" : p === "dhuhr" && friday ? "Jumu'ah Mubarak!" : `Alhamdulillah, ${label(p)} ✓` })
            }
          >
            <span className={`text-[15px] ${p === "dhuhr" && friday ? "text-[15px]" : ""}`}>{label(p)}</span>
            {day.prayers[p] ? <PixelIcon name="check" size={12} color="#fff" /> : <span className="h-3 text-[14px] leading-3">·</span>}
          </button>
        ))}
      </div>
      <p className="text-[14px] text-[var(--muted)]">
        {friday ? `It's Friday: Jumu'ah pays +${RULES.jumuah.coins} extra. ` : ""}Each unchecked prayer at midnight costs {RULES.prayer.missCoins}. All five earns a bonus.
      </p>
    </Card>
  );
}

export function PurityCard() {
  const { game, act, day, streaks } = useToday();
  const [urge, setUrge] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const nextCar = CAR_UNLOCKS.find((u) => !game.inventory.some((i) => i.itemId === u.id));
  const toCar = nextCar ? Math.max(0, nextCar.cleanDays - streaks.clean) : 0;
  return (
    <Card title="Quit porn" icon="shield" right={<span className="normal-case">best {game.best.clean}</span>}>
      <div className="flex items-end gap-3">
        <div className="font-pixel text-4xl leading-none tabular-nums">{streaks.clean}</div>
        <div className="pb-0.5 text-[14px]">
          days clean · {nextCar ? `${toCar} more for the ${ITEMS[nextCar.id].name.replace(/^\d+ /, "")}` : "all cars unlocked"}
        </div>
      </div>
      <div className="bar">
        <div className="h-full bg-[linear-gradient(#5b8fe0,#3d6fd1)]" style={{ width: `${nextCar ? Math.min(100, (streaks.clean / nextCar.cleanDays) * 100) : 100}%` }} />
      </div>
      {day.urgesResisted > 0 && <p className="text-[14px]">Urges beaten today: {day.urgesResisted}</p>}
      {day.relapses > 0 && <p className="text-[14px] text-[var(--bad)]">Relapsed today. Tomorrow is day 1. Go again.</p>}
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
            act((s, n) => resistUrge(s, n), { kind: "urge", say: "Stayed strong. Alhamdulillah." });
            setUrge(false);
          }}
        />
      )}
      {confirm && (
        <Dialog title="Log relapse" onClose={() => setConfirm(false)}>
          <p>Strict mode. This will:</p>
          <ul className="list-disc pl-5 text-[14px]">
            <li>Reset your clean streak to 0</li>
            <li>Cost {RULES.relapse.coins} coins (you can go into debt)</li>
            <li>Lock your newest item for {RULES.relapse.lockDays} clean days</li>
            <li>Make your room gloomy until a clean day</li>
          </ul>
          <p className="text-[14px]">Being honest here is the discipline. It can&apos;t be undone.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              className="btn btn-red"
              onClick={() => {
                act((s, n) => relapse(s, n), { kind: "relapse", say: "Astaghfirullah. Back to day one." });
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
    act((s, n) => logMeal(s, n, meal, onPlan), onPlan ? { kind: "diet", say: "Bismillah. On plan!" } : { kind: "cheat", say: "Cheat meal..." });
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
        <ul className="space-y-0.5 text-[14px]">
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

export function GymCard() {
  const { game, act, day } = useToday();
  const monday = mondayOf(day.date);
  const count = gymCountInWeek(game, monday);
  const stage = game.body.stage;
  const next = BODY_THRESHOLDS[stage + 1];
  const outfit = game.equipped.outfit as OutfitId;
  return (
    <Card title={`Gym · ${count}/${RULES.gym.perWeek} this week`} icon="star" right={<Streak n={game.streaks.gymWeeks} />}>
      <div className="flex items-center gap-3">
        <div className="flex h-[72px] w-12 shrink-0 items-end justify-center rounded-[3px] bg-[linear-gradient(#cfe0f2,#a9c6dc)]">
          <RasterCanvas make={() => renderAvatar("front", "idle", outfit, stage as BodyStage)} deps={[stage, outfit]} style={{ height: 64 }} label={`Body stage ${stage}`} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex gap-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, k) => {
              const date = addDays(monday, k);
              const went = !!game.days[date]?.gym;
              return (
                <div key={k} className={`flex h-7 flex-1 items-center justify-center rounded-[3px] border-2 border-black text-[12.5px] ${went ? "bg-[#e0662c] text-white" : date === day.date ? "bg-white" : "bg-[var(--panel-2)]"}`}>
                  {d}
                </div>
              );
            })}
          </div>
          <div className="text-[14px] leading-tight">
            Body: <b>{BODY_NAMES[stage]}</b>
            {next !== undefined ? ` · ${next - game.body.points} more full week${next - game.body.points === 1 ? "" : "s"} to level up` : " · max"}
          </div>
        </div>
      </div>
      <button
        className={`btn w-full py-2 ${day.gym ? "btn-green" : ""}`}
        onClick={() => act((s, n) => setGym(s, n, !day.gym), day.gym ? undefined : { kind: "gym", say: "Light weight, baby!" })}
      >
        {day.gym ? "Went to the gym today ✓" : "I went to the gym today"}
      </button>
      <p className="text-[14px] text-[var(--muted)]">
        4 visits by Sunday or lose {RULES.gym.missWeekCoins} coins. Two missed weeks in a row and your body slips back a stage.
      </p>
    </Card>
  );
}

export function QuranCard() {
  const { game, act, day, streaks } = useToday();
  const pages = day.quranPages ?? 0;
  const goal = game.settings.quranGoal;
  const total = game.stats.quranPages % 604;
  const set = (n: number) => act((s, now) => setQuranPages(s, now, n), n > pages && n >= goal && pages < goal ? { kind: "quran", say: "SubhanAllah. Pages done." } : undefined);
  return (
    <Card title={`Quran · ${pages}/${goal} pages`} icon="scroll" right={<Streak n={streaks.quran} />}>
      <div className="flex items-center gap-2">
        <button className="btn h-11 w-11 px-0 text-2xl" onClick={() => set(pages - 1)} disabled={pages === 0} aria-label="One page less">
          −
        </button>
        <div className="flex-1 text-center">
          <div className="font-pixel text-2xl tabular-nums">{pages}</div>
          <div className="text-[14px] text-[var(--muted)]">pages today</div>
        </div>
        <button className="btn btn-green h-11 w-11 px-0 text-2xl" onClick={() => set(pages + 1)} aria-label="One page more">
          +
        </button>
      </div>
      <div className="flex items-center gap-2 text-[14px]">
        <span className="shrink-0">Khatm</span>
        <div className="bar flex-1">
          <div className="h-full bg-[linear-gradient(#2f9a72,#1f7a5c)]" style={{ width: `${(total / 604) * 100}%` }} />
        </div>
        <span className="shrink-0 tabular-nums">{total}/604</span>
      </div>
    </Card>
  );
}

export function BedtimeCard() {
  const { game, act, now } = useToday();
  const night = game.days[bedKey(now)];
  const win = bedWindow(game, now);
  const done = night?.bed && night.bed !== "pending";
  if (!done && win === "too-early")
    return (
      <section className="panel flex items-center gap-2.5 px-3.5 py-2.5 text-[15px] text-[var(--muted)]">
        <PixelIcon name="moon" size={14} color="var(--head)" />
        <span className="flex-1">
          Bedtime check-in opens at <b className="text-[var(--ink)]">{RULES.bed.opensHour}:00</b> (in bed by {game.settings.bedtime})
        </span>
        <Streak n={game.streaks.bed} />
      </section>
    );
  return (
    <Card title={`Bedtime · ${game.settings.bedtime}`} icon="moon" right={<Streak n={game.streaks.bed + (night?.bed === "ok" ? 1 : 0)} />}>
      {done ? (
        <p className={night!.bed === "ok" ? "text-[var(--good)]" : "text-[var(--bad)]"}>
          {night!.bed === "ok" ? "In bed on time" : "Late to bed"} at {night!.bedAt ? new Date(night!.bedAt).toTimeString().slice(0, 5) : "?"}. Good night.
        </p>
      ) : (
        <>
          <p>
            Check in between {RULES.bed.opensHour}:00 and <b>{game.settings.bedtime}</b> so 08:30 is easy. Missing it costs {RULES.bed.missCoins}.
          </p>
          <button
            className={`btn w-full py-2 ${win === "late" ? "btn-red" : "btn-blue"}`}
            disabled={win === "too-early"}
            onClick={() => act((s, n) => bedCheckIn(s, n), win === "late" ? { kind: "late", say: "Late night..." } : { kind: "bed", say: "Bismillah. Lights out, good night." })}
          >
            {win === "too-early" ? `Opens at ${RULES.bed.opensHour}:00` : win === "late" ? `Going to bed (late, -${RULES.bed.missCoins})` : "Going to bed"}
          </button>
        </>
      )}
    </Card>
  );
}

export function RamadanCard() {
  const { game, act, day } = useToday();
  if (!game.settings.ramadan) return null;
  return (
    <Card title="Ramadan" icon="moon" right={<span className="normal-case">{game.stats.fasts} fasts</span>}>
      <div className="grid grid-cols-2 gap-2">
        <button
          className={`btn py-2 ${day.fasted ? "btn-green" : ""}`}
          onClick={() => act((s, n) => setFast(s, n, !day.fasted), day.fasted ? undefined : { kind: "pray", say: "Bismillah, fasting today." })}
        >
          {day.fasted ? "Fasting ✓" : "I'm fasting"}
        </button>
        <button
          className={`btn py-2 ${day.taraweeh ? "btn-green" : ""}`}
          onClick={() => act((s, n) => setTaraweeh(s, n, !day.taraweeh), day.taraweeh ? undefined : { kind: "pray", say: "Alhamdulillah, Taraweeh ✓" })}
        >
          {day.taraweeh ? "Taraweeh ✓" : "Taraweeh"}
        </button>
      </div>
      <p className="text-[14px] text-[var(--muted)]">No penalties here: missed fasts for travel or illness are allowed.</p>
    </Card>
  );
}

const CARDS = {
  wake: WakeCard,
  prayers: PrayersCard,
  purity: PurityCard,
  gym: GymCard,
  quran: QuranCard,
  diet: DietCard,
  bed: BedtimeCard,
  habits: HabitsCard,
};
type CardId = keyof typeof CARDS;

/** What matters most right now goes first: mornings start with waking up, evenings with dinner, nights with bed. */
export function cardOrder(hour: number): CardId[] {
  if (hour >= 4 && hour < 12) return ["wake", "prayers", "purity", "gym", "quran", "diet", "habits", "bed"];
  if (hour >= 12 && hour < 18) return ["prayers", "gym", "quran", "purity", "diet", "habits", "wake", "bed"];
  if (hour >= 18 && hour < 21) return ["diet", "prayers", "quran", "gym", "purity", "habits", "bed", "wake"];
  return ["bed", "prayers", "diet", "quran", "purity", "habits", "gym", "wake"];
}

export default function Today() {
  const now = useNow();
  return (
    <div className="space-y-3">
      <TodaySummary />
      <RamadanCard />
      {cardOrder(now.getHours()).map((id) => {
        const C = CARDS[id];
        return <C key={id} />;
      })}
    </div>
  );
}
