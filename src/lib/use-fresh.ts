import { useEffect, useState } from "react";

// Returns the ms timestamp of the last time `data` changed to a defined
// value — a lightweight "last updated" signal for the Card freshness pill.
// SWR keeps a stable reference when content is unchanged, so this updates on
// genuine data changes (initial load + each real refresh that brings new data).
export function useFreshAt(data: unknown): number | undefined {
  const [ts, setTs] = useState<number>();
  useEffect(() => {
    if (data !== undefined && data !== null) setTs(Date.now());
  }, [data]);
  return ts;
}
