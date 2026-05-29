import chokidar from "chokidar";
import fs from "node:fs";
import { loadConfig } from "./config.js";
import { State } from "./state.js";
import { Syncer } from "./sync.js";

// Entry point: watch the folder, and run a sync cycle on startup, on a periodic
// interval, and whenever the machine likely woke from sleep (detected via a
// large jump in the monotonic clock vs wall clock between ticks).
async function main() {
  const cfg = loadConfig();
  fs.mkdirSync(cfg.dir, { recursive: true });

  const state = new State(cfg.statePath);
  const syncer = new Syncer(cfg, state);

  console.log(`[docsync] syncing ${cfg.dir} ↔ ${cfg.server}`);

  // Initial sync on start.
  await syncer.trigger();

  // Debounced file-change trigger.
  let debounce: NodeJS.Timeout | null = null;
  const schedule = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => syncer.trigger(), 800);
  };

  chokidar
    .watch(cfg.dir, {
      ignoreInitial: true,
      ignored: /(^|[/\\])(\.docsync|\.git|node_modules|\.DS_Store)/,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    })
    .on("all", schedule);

  // Periodic sync + wake detection.
  let lastTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    const drift = now - lastTick - cfg.intervalMs;
    lastTick = now;
    if (drift > 5000) console.log("[docsync] wake detected — syncing");
    syncer.trigger();
  }, cfg.intervalMs);
}

main().catch((e) => {
  console.error("[docsync] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
