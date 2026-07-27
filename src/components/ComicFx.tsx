"use client";

import { useEffect } from "react";

// Click bursts for the "comic" theme: tap anywhere and a POW/BAM/ZAP star
// punches out of the pointer, holds for a beat and fades.
//
// The nodes live in one fixed, pointer-events:none layer at z-index 50 —
// above the cards (which top out in the 40s) and below every popover and menu
// (58+), so a burst is never in the way of something you have to click. The
// layer itself only exists while the theme is on: the MutationObserver on
// <html data-theme> builds it on the way in and tears it down on the way out,
// which is the same shape WeatherFx uses.
//
// Everything is built with createElement rather than JSX/state. These nodes
// are transient decoration outside React's tree — putting them in state would
// re-render the whole app several times a second for something that never
// interacts with the rest of the page. All the styling is in
// src/app/themes/comic.css, so the burst is themable (and flips light/dark)
// without touching this file.
//
// The rules it plays by, because an effect on EVERY click is one wrong move
// away from being unusable:
//  · the listener is passive and on the capture phase — passive makes
//    preventDefault impossible by construction, and capture means we still
//    see clicks that a component later stops propagating. Buttons, links and
//    inputs keep behaving exactly as they did.
//  · pointerdown, not click, so a tap feels instant on touch. Pointer events
//    already unify mouse/touch/pen, so there is no double-fire on mobile.
//  · a press that turns into a drag pulls its own burst back (that's a text
//    selection, not a click), and a press that lands while text is selected
//    is the click that dismisses the selection, so it never fires at all.
//  · hard cap on concurrent bursts plus a minimum gap between them, so
//    hammering the mouse cannot grow the DOM without bound.
//  · every node owns exactly one timer; stop() clears all of them and drops
//    the whole layer, so nothing can outlive the theme.

const WORDS = [
  "POW", "BAM", "ZAP", "BOOM", "WHAM", "THWACK",
  "KAPOW", "ZONK", "SMASH", "BIFF", "CRASH", "WHAP",
];

const MAX_LIVE = 5;      // concurrent bursts; extras are dropped, not queued
const MIN_GAP = 70;      // ms between bursts — rapid-fire clicking stays calm
const DRAG_PX = 10;      // movement that reclassifies a press as a drag
const DRAG_WINDOW = 220; // ...but only while the burst is still young

export function ComicFx() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let layer: HTMLDivElement | null = null;
    let active = false;
    let lastAt = 0;
    let lastWord = -1;

    // Live nodes and their self-destruct timers, so teardown is exhaustive.
    const timers = new Map<HTMLElement, number>();

    // The press we might still have to take back.
    let watched: HTMLElement | null = null;
    let downX = 0;
    let downY = 0;
    let downAt = 0;

    const isComic = () => root.getAttribute("data-theme") === "comic";

    // Never the same shout twice running — repetition is what makes an effect
    // like this start to feel mechanical.
    function pick(): string {
      let i = Math.floor(Math.random() * WORDS.length);
      if (i === lastWord) i = (i + 1) % WORDS.length;
      lastWord = i;
      return WORDS[i];
    }

    function drop(node: HTMLElement) {
      const t = timers.get(node);
      if (t !== undefined) window.clearTimeout(t);
      timers.delete(node);
      if (node.parentNode) node.parentNode.removeChild(node);
      if (watched === node) unwatch();
    }

    function part(node: HTMLElement, cls: string) {
      const el = document.createElement("span");
      el.className = cls;
      node.appendChild(el);
      return el;
    }

    function spawn(x: number, y: number) {
      if (!layer) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Scale with the smaller viewport edge so a phone doesn't get a burst
      // that covers the screen, then clamp both ends.
      const size = Math.round(Math.max(116, Math.min(206, Math.min(vw, vh) * 0.3)));
      const scale = 0.88 + Math.random() * 0.26;
      const rot = (Math.random() * 2 - 1) * 13;
      const word = pick();

      // A star hanging half off the edge reads as a bug, so pull it inside.
      // (The speed lines reach further and may clip — that looks fine, and
      // the layer's overflow:hidden is what keeps them from ever scrolling.)
      const pad = (size * scale) / 2 + 6;
      const cx = vw > pad * 2 ? Math.min(vw - pad, Math.max(pad, x)) : vw / 2;
      const cy = vh > pad * 2 ? Math.min(vh - pad, Math.max(pad, y)) : vh / 2;

      // Reduced motion gets a short static mark; comic.css swaps the
      // animation, this just makes it leave sooner.
      const dur = reduce ? 320 : 620 + Math.round(Math.random() * 270);

      const node = document.createElement("div");
      node.className = "cfx-burst";
      node.setAttribute("aria-hidden", "true");
      node.style.left = `${Math.round(cx)}px`;
      node.style.top = `${Math.round(cy)}px`;
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      node.style.setProperty("--cfx-rot", `${rot.toFixed(2)}deg`);
      node.style.setProperty("--cfx-scale", scale.toFixed(3));
      node.style.setProperty("--cfx-spin", `${Math.round(Math.random() * 360)}deg`);
      node.style.setProperty("--cfx-dur", `${dur}ms`);
      // THWACK has to fit the same inner star as POW, so the type size comes
      // down with the letter count instead of spilling over the ink.
      node.style.setProperty("--cfx-fs", `${(size * (0.325 - word.length * 0.021)).toFixed(1)}px`);

      // Paint order is DOM order: lines, ink rim, star, inner rim, core, word.
      part(node, "cfx-rays");
      part(node, "cfx-shell");
      part(node, "cfx-star");
      part(node, "cfx-core-shell");
      part(node, "cfx-core");
      const text = document.createElement("i");
      text.className = "cfx-text";
      text.textContent = word;
      part(node, "cfx-word").appendChild(text);

      layer.appendChild(node);

      // Which face actually rendered depends on the machine — Impact is
      // narrow, the fallbacks are not — so the only reliable way to keep a
      // long word inside its star is to measure what we got and condense it.
      // Costs one forced layout per burst, at most a few times a second, and
      // it happens before the first painted frame so nothing jumps.
      const fits = size * 0.8;
      const got = text.offsetWidth;
      if (got > fits) node.style.setProperty("--cfx-fit", (fits / got).toFixed(3));

      // A timer, not `animationend`: animationend never arrives if the
      // animation is interrupted or the tab is hidden mid-flight, and a timer
      // is something teardown can positively cancel.
      timers.set(node, window.setTimeout(() => drop(node), dur + 80));
      return node;
    }

    // ---------- drag / selection guards ----------

    const onMove = (e: PointerEvent) => {
      if (!watched) return;
      if (Math.abs(e.clientX - downX) < DRAG_PX && Math.abs(e.clientY - downY) < DRAG_PX) return;
      // The press moved: it's a drag (nearly always a text selection). While
      // the burst is only a few frames old, pulling it reads as nothing ever
      // happened; past that it's already been seen, so let it play out.
      if (performance.now() - downAt < DRAG_WINDOW) drop(watched);
      unwatch();
    };

    const onUp = () => unwatch();

    function watch(node: HTMLElement) {
      watched = node;
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onUp, { passive: true });
    }

    function unwatch() {
      watched = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }

    const onDown = (e: PointerEvent) => {
      if (!active || !layer) return;
      // Primary button only, and only the first finger of a multi-touch.
      // Right/middle click open menus and paste; they aren't "hits".
      if (e.button !== 0 || !e.isPrimary) return;
      // A modified click is someone opening a link in a tab or extending a
      // selection — deliberate work, not play.
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      // Typing surfaces stay quiet: a star over the caret while you're
      // filling in a field is pure noise.
      if (target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;

      // Clicking while text is selected is the click that clears it. The
      // selection is still live here because collapsing it is the default
      // action of the mousedown that follows this pointerdown.
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().length > 0) return;

      const now = performance.now();
      if (now - lastAt < MIN_GAP) return;
      if (timers.size >= MAX_LIVE) return;
      lastAt = now;

      const node = spawn(e.clientX, e.clientY);
      // Nothing below this line touches the event: no preventDefault, no
      // stopPropagation, and the listener is registered passive so it
      // couldn't cancel anything even by mistake.
      if (node && !reduce) watch(node);
    };

    // ---------- activation ----------

    function start() {
      if (active) return;
      active = true;
      const el = document.createElement("div");
      el.className = "cfx-layer";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
      layer = el;
      // Capture phase: we run before anything can stop propagation. Passive:
      // the browser knows this handler can't cancel the gesture, so scrolling
      // and tapping stay on the fast path.
      window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    }

    function stop() {
      if (!active) return;
      active = false;
      window.removeEventListener("pointerdown", onDown, { capture: true });
      unwatch();
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
      // Dropping the layer takes every burst inside it with it.
      if (layer?.parentNode) layer.parentNode.removeChild(layer);
      layer = null;
    }

    function sync() {
      if (isComic()) start();
      else stop();
    }

    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    sync();

    return () => {
      mo.disconnect();
      stop();
    };
  }, []);

  return null;
}
