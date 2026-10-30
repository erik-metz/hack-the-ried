"use client";
import { useEffect, useState } from "react";
import { pollVisible } from "../visiblePolling";
import { readPublicResource } from "../publicRequests";
export type DatasetResults<T extends unknown[]> = { [K in keyof T]: PromiseSettledResult<T[K]> };
export function fulfilledValues<T extends unknown[]>(results: DatasetResults<T>): T | null {
  return results.every(result => result.status === "fulfilled") ? results.map(result => (result as PromiseFulfilledResult<unknown>).value) as T : null;
}
/** Static pages fetch public publications in-browser; expired batches are never retained. */
export function usePublicDatasets<T extends unknown[]>(paths: readonly string[], intervalMs = 300000) {
  const key = JSON.stringify(paths);
  const [state, setState] = useState<{ key: string; results: DatasetResults<T>; loadedAt: number; expiresAt: number } | null>(null);
  useEffect(() => {
    let expiryTimer: ReturnType<typeof setTimeout>;
    const stop = pollVisible(async signal => {
      const requested: string[] = JSON.parse(key);
      const resources = await Promise.allSettled(requested.map(path => readPublicResource(path, signal)));
      if (signal.aborted) return;
      const loadedAt = Date.now();
      const expiresAt = Math.min(loadedAt + intervalMs, ...resources.map(r => r.status === "fulfilled" ? r.value.expiresAt : Infinity));
      const results = resources.map(r => r.status === "fulfilled" && r.value.expiresAt > loadedAt
        ? { status: "fulfilled", value: r.value.data } : { status: "rejected", reason: new Error("Publication unavailable or expired") }) as DatasetResults<T>;
      setState({ key, results, loadedAt, expiresAt });
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(() => setState(previous => previous?.loadedAt === loadedAt ? null : previous), Math.max(0, expiresAt - loadedAt));
      return Math.min(expiresAt - loadedAt, resources.some(r => r.status === "rejected") ? 30000 : intervalMs);
    }, intervalMs, { onPause: () => { clearTimeout(expiryTimer); setState(null); } });
    return () => { stop(); clearTimeout(expiryTimer); };
  }, [key, intervalMs]);
  return state?.key === key ? state : null;
}
