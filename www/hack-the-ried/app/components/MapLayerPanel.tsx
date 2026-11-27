import type { ReactNode } from "react";

/**
 * One line per active map layer: title and current status stay visible,
 * legend, notes and source attribution open on demand.
 */
export default function MapLayerPanel({ title, status, children }: { title: string; status?: ReactNode; children?: ReactNode }) {
  return <details className="rounded border border-slate-700/70 px-2 py-1" aria-label={title}>
    <summary className="cursor-pointer">
      <strong className="text-slate-300">{title}</strong>
      {status ? <span role="status"> · {status}</span> : null}
    </summary>
    {children ? <div className="mt-1 space-y-1 pb-1">{children}</div> : null}
  </details>;
}
