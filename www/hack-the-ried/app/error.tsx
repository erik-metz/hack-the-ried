"use client";
export default function DataError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-3xl p-12 text-slate-200" role="alert">
    <h1 className="text-2xl font-bold">Daten derzeit nicht verfügbar</h1>
    <p className="my-4">Für diese Ansicht liegen noch keine abrufbaren Daten des VPS vor. Es werden keine Ersatzwerte angezeigt.</p>
    <button className="rounded border px-4 py-2" onClick={reset}>Erneut versuchen</button>
  </main>;
}
