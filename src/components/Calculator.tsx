"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator as CalcIcon, X, Delete } from "lucide-react";

// A small, real calculator in an anchored popover. Chained operations,
// percent, sign flip, decimals, backspace, clear. Full keyboard support
// while open. No portal/backdrop — it never covers the page.
export function Calculator() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // display = what's shown; acc = the running left operand; op = pending
  // operator; fresh = next digit starts a new number.
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function inputDigit(d: string) {
    setDisplay((cur) => (fresh || cur === "0" ? d : cur + d));
    setFresh(false);
  }
  function inputDot() {
    if (fresh) { setDisplay("0."); setFresh(false); return; }
    setDisplay((cur) => (cur.includes(".") ? cur : cur + "."));
  }
  function clearAll() { setDisplay("0"); setAcc(null); setOp(null); setFresh(true); }
  function backspace() {
    setDisplay((cur) => (cur.length <= 1 || (cur.length === 2 && cur.startsWith("-")) ? "0" : cur.slice(0, -1)));
  }
  function percent() { setDisplay((cur) => String(parseFloat(cur) / 100)); }
  function negate() { setDisplay((cur) => (cur.startsWith("-") ? cur.slice(1) : cur === "0" ? cur : "-" + cur)); }

  function compute(a: number, b: number, o: string): number {
    switch (o) {
      case "+": return a + b;
      case "−": return a - b;
      case "×": return a * b;
      case "÷": return b === 0 ? NaN : a / b;
      default: return b;
    }
  }
  function applyOp(nextOp: string) {
    const cur = parseFloat(display);
    if (acc == null) {
      setAcc(cur);
    } else if (op && !fresh) {
      const r = compute(acc, cur, op);
      setAcc(r);
      setDisplay(fmt(r));
    }
    setOp(nextOp);
    setFresh(true);
  }
  function equals() {
    if (op == null || acc == null) return;
    const cur = parseFloat(display);
    const r = compute(acc, cur, op);
    setDisplay(fmt(r));
    setAcc(null);
    setOp(null);
    setFresh(true);
  }
  function fmt(n: number): string {
    if (!Number.isFinite(n)) return "Error";
    // Trim float noise; keep up to 10 significant digits.
    return String(Math.round(n * 1e10) / 1e10);
  }

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (/[0-9]/.test(k)) { e.preventDefault(); inputDigit(k); }
      else if (k === ".") { e.preventDefault(); inputDot(); }
      else if (k === "+") { e.preventDefault(); applyOp("+"); }
      else if (k === "-") { e.preventDefault(); applyOp("−"); }
      else if (k === "*") { e.preventDefault(); applyOp("×"); }
      else if (k === "/") { e.preventDefault(); applyOp("÷"); }
      else if (k === "Enter" || k === "=") { e.preventDefault(); equals(); }
      else if (k === "Backspace") { e.preventDefault(); backspace(); }
      else if (k === "%") { e.preventDefault(); percent(); }
      else if (k === "Escape") { e.preventDefault(); if (display !== "0" || op) clearAll(); else setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, display, acc, op, fresh]);

  const Key = ({ label, onClick, variant = "num", wide = false }:
    { label: React.ReactNode; onClick: () => void; variant?: "num" | "op" | "fn" | "eq"; wide?: boolean }) => (
    <button
      onClick={onClick}
      className={`h-10 rounded-xl text-[15px] font-medium transition active:scale-95 ${wide ? "col-span-2" : ""} ${
        variant === "op" ? "bg-[var(--accent-soft)] text-accent hover:brightness-110"
        : variant === "fn" ? "bg-[var(--rule-soft)] text-ink-soft hover:bg-[var(--rule)]"
        : variant === "eq" ? "text-white"
        : "bg-[var(--rule-soft)] text-ink hover:bg-[var(--rule)]"
      }`}
      style={variant === "eq" ? { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" } : undefined}
    >
      {label}
    </button>
  );

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Calculator"
        title="Calculator"
        className={`btn-ghost ${open ? "!text-accent !border-[var(--accent)]" : ""}`}
      >
        <CalcIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-x-2 top-[64px] md:absolute md:right-0 md:top-[calc(100%+8px)] z-[70] w-[270px] max-w-[calc(100vw-1rem)] rounded-2xl border border-[var(--glass-border)] bg-[var(--paper-2)] backdrop-blur-xl shadow-[var(--shadow-hover)] p-3 animate-fadeIn origin-top-right">
          <div className="flex items-center justify-between mb-2">
            <span className="label flex items-center gap-1.5"><CalcIcon className="h-3 w-3" /> Calculator</span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted-2 hover:text-ink transition">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mb-2.5 rounded-xl bg-[var(--rule-soft)] px-3 py-2.5 text-right">
            {op && acc != null && (
              <div className="font-mono text-[11px] text-muted-2 truncate">{fmt(acc)} {op}</div>
            )}
            <div className="font-mono tabular-nums text-2xl text-ink truncate">{display}</div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <Key label="C" variant="fn" onClick={clearAll} />
            <Key label="±" variant="fn" onClick={negate} />
            <Key label="%" variant="fn" onClick={percent} />
            <Key label="÷" variant="op" onClick={() => applyOp("÷")} />

            <Key label="7" onClick={() => inputDigit("7")} />
            <Key label="8" onClick={() => inputDigit("8")} />
            <Key label="9" onClick={() => inputDigit("9")} />
            <Key label="×" variant="op" onClick={() => applyOp("×")} />

            <Key label="4" onClick={() => inputDigit("4")} />
            <Key label="5" onClick={() => inputDigit("5")} />
            <Key label="6" onClick={() => inputDigit("6")} />
            <Key label="−" variant="op" onClick={() => applyOp("−")} />

            <Key label="1" onClick={() => inputDigit("1")} />
            <Key label="2" onClick={() => inputDigit("2")} />
            <Key label="3" onClick={() => inputDigit("3")} />
            <Key label="+" variant="op" onClick={() => applyOp("+")} />

            <Key label="0" wide onClick={() => inputDigit("0")} />
            <Key label="." onClick={inputDot} />
            <Key label={<span className="inline-flex items-center justify-center"><Delete className="h-4 w-4" /></span>} variant="fn" onClick={backspace} />
          </div>
          <button
            onClick={equals}
            className="mt-1.5 w-full h-10 rounded-xl text-white text-[15px] font-semibold transition active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
          >
            =
          </button>
        </div>
      )}
    </div>
  );
}
