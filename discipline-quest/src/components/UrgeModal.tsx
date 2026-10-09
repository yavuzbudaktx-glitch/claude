"use client";
import { useEffect, useState } from "react";
import Dialog from "./Dialog";

const HOLD_SECONDS = 60;
const MOVES = [
  "Stand up and leave the room",
  "Make wudu with cold water",
  "20 push-ups, right now",
  "Read one page of Quran",
  "Text or call someone",
  "Phone face-down in another room",
];

export default function UrgeModal({ onResist, onClose }: { onResist: () => void; onClose: () => void }) {
  const [left, setLeft] = useState(HOLD_SECONDS);
  useEffect(() => {
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Dialog title="Urge mode" onClose={onClose}>
      <p className="text-center text-3xl" dir="rtl" lang="ar">
        أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ
      </p>
      <p className="text-center text-base italic">I seek refuge in Allah from Shaytan, the accursed.</p>
      <p>The urge peaks and fades in minutes. Ride it out. Pick one:</p>
      <ul className="grid grid-cols-2 gap-1.5 text-base">
        {MOVES.map((m) => (
          <li key={m} className="chip bg-white">
            {m}
          </li>
        ))}
      </ul>
      <div className="text-center font-pixel text-2xl">{left > 0 ? `0:${String(left).padStart(2, "0")}` : "You made it"}</div>
      <div className="h-3 rounded-[3px] border-2 border-black bg-[#d9d4c4]">
        <div className="h-full bg-[#4caf50] transition-all" style={{ width: `${((HOLD_SECONDS - left) / HOLD_SECONDS) * 100}%` }} />
      </div>
      <button className="btn btn-green w-full py-2" disabled={left > 0} onClick={onResist}>
        I resisted (+coins)
      </button>
    </Dialog>
  );
}
