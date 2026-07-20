// NoFap page: persisted state shape, streak math, and the hardcoded
// motivation content (quotes, milestones, panic lines). Content is
// intentionally harsh — that's the brief. Mixed English/Turkish.

export interface NofapRelapse {
  at: number;       // epoch ms of the relapse
  streakMs: number; // length of the streak that was lost
}

export interface NofapPanic {
  at: number;
  survived: boolean;
}

export interface NofapState {
  v: 1;
  startedAt: number | null; // epoch ms of current streak start; null = never started
  bestMs: number;           // longest streak ever (ms)
  relapses: NofapRelapse[]; // newest first
  panics: NofapPanic[];     // newest first
}

export const NOFAP_DEFAULT: NofapState = {
  v: 1,
  startedAt: null,
  bestMs: 0,
  relapses: [],
  panics: [],
};

// Synced blobs can arrive partial or stale from another device/old version —
// coerce anything malformed back to a usable state instead of crashing.
export function sanitizeState(raw: unknown): NofapState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<NofapState>;
  const startedAt =
    typeof r.startedAt === "number" && r.startedAt > 0
      ? Math.min(r.startedAt, Date.now())
      : null;
  return {
    v: 1,
    startedAt,
    bestMs: typeof r.bestMs === "number" && r.bestMs > 0 ? r.bestMs : 0,
    relapses: Array.isArray(r.relapses)
      ? r.relapses.filter((x) => x && typeof x.at === "number").slice(0, 200)
      : [],
    panics: Array.isArray(r.panics)
      ? r.panics.filter((x) => x && typeof x.at === "number").slice(0, 200)
      : [],
  };
}

export function splitDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
  };
}

export function formatDurationShort(ms: number): string {
  const { days, hours, mins } = splitDuration(ms);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export const QUOTES: { text: string; lang: "en" | "tr" }[] = [
  { text: "Nobody is coming to save you. Save yourself.", lang: "en" },
  { text: "Every relapse is a vote for the man you don't want to be.", lang: "en" },
  { text: "The urge is lying to you. It always lies.", lang: "en" },
  { text: "You've watched enough of other people living. Go live.", lang: "en" },
  { text: "Discipline is choosing what you want most over what you want now.", lang: "en" },
  { text: "Bir dakikalık zevk için kaç günü çöpe atacaksın?", lang: "tr" },
  { text: "Bahane üretme. Kimse dinlemiyor.", lang: "tr" },
  { text: "Bu dürtü geçecek. Pişmanlık geçmez.", lang: "tr" },
  { text: "You don't lose the streak. You throw it away. Own the difference.", lang: "en" },
  { text: "Weak men wait for motivation. Strong men keep the promise anyway.", lang: "en" },
  { text: "Kendine verdiğin sözü tutamayan adama kimse güvenmez — sen bile.", lang: "tr" },
  { text: "Your brain is not your friend right now. Outlast it.", lang: "en" },
  { text: "Comfort is a slow way of dying. Choose the hard thing.", lang: "en" },
  { text: "Disiplin özgürlüktür. Dürtülerinin kölesi olma.", lang: "tr" },
  { text: "The man you want to become is watching what you do next.", lang: "en" },
  { text: "Aynaya bak. O adam bundan daha fazlasını hak ediyor.", lang: "tr" },
  { text: "Five minutes of shame is not worth thirty days of work.", lang: "en" },
  { text: "You've quit a hundred times. Quitting quitting is the only one that counts.", lang: "en" },
  { text: "Zorlandığın yerde büyürsün. Kaçtığın yerde küçülürsün.", lang: "tr" },
  { text: "It's not about the streak number. It's about who keeps it.", lang: "en" },
  { text: "Semen retention isn't magic. Self-respect is.", lang: "en" },
  { text: "Bugün kaçarsan, yarın da kaçarsın. Zincir bugün kırılır.", lang: "tr" },
  { text: "Boredom is not an emergency. Sit with it.", lang: "en" },
  { text: "The screen doesn't miss you. Your life does.", lang: "en" },
  { text: "Sen bu savaşı kazanmak için buradasın, izlemek için değil.", lang: "tr" },
  { text: "Hard now, proud later. Easy now, disgusted later. Pick one.", lang: "en" },
  { text: "Your future wife/kids won't care about your excuses. Neither should you.", lang: "en" },
  { text: "Geri sayım yok. Tek yön: ileri.", lang: "tr" },
];

export const MILESTONES: { days: number; title: string; note: string }[] = [
  { days: 1,   title: "Day One",       note: "The decision is made. Withdrawal starts — that discomfort is the addiction dying, not you." },
  { days: 3,   title: "The Spike",     note: "Urges usually peak around now. Survive these 72 hours and they start losing power." },
  { days: 7,   title: "One Week",      note: "Sleep deepens, energy climbs. Your dopamine system is noticing the silence." },
  { days: 14,  title: "Two Weeks",     note: "Brain fog lifts. Focus and eye contact come back. Flatline may hit — it's healing, not failure." },
  { days: 30,  title: "One Month",     note: "Dopamine sensitivity measurably recovering. Normal life starts feeling good again." },
  { days: 60,  title: "Two Months",    note: "New default installed. Triggers that owned you now just pass by." },
  { days: 90,  title: "The Reboot",    note: "The classic benchmark: receptor density largely restored. You are running on a rebuilt brain." },
  { days: 180, title: "Half a Year",   note: "This is no longer a challenge. It's who you are." },
  { days: 365, title: "One Year",      note: "Free. The person who started this streak wouldn't recognize you." },
];

export const PANIC_LINES: string[] = [
  "STOP. This urge is a wave — it peaks, then it dies. Ride it out.",
  "You are ten minutes of discomfort away from keeping everything. That's the whole price.",
  "Bu his en fazla 10 dakika sürer. Pişmanlık günlerce.",
  "Close the tabs. Stand up. Cold water on your face. NOW.",
  "The version of you that gives in doesn't get to complain about his life.",
  "Your brain is screaming for a drug. You are not your brain's errand boy.",
  "Şu an vazgeçersen, yarın aynaya nasıl bakacaksın?",
  "Nothing you're about to see is worth what you're about to lose.",
  "You've been here before. You know exactly how the regret tastes. Skip it.",
  "Breathe. The counter upstairs is still running. Keep it running.",
  "Dayan. Bu dalga geçince daha güçlü olacaksın. Her seferinde daha güçlü.",
  "Do twenty push-ups instead. Anger beats urge. Move.",
];
