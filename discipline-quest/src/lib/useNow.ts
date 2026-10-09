"use client";
import { useEffect, useState } from "react";
import { getNow } from "./clock";

export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(getNow);
  useEffect(() => {
    const id = setInterval(() => setNow(getNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
