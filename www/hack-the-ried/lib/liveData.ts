/** Public read-only endpoints; the configured origin never includes backend credentials. */
export function liveDataUrl(kind: "movements" | "satellites", transport: "stream" | "latest") {
  return `${process.env.NEXT_PUBLIC_LIVE_API_ORIGIN}/api/v1/${kind}/${transport}`;
}

/** Keep streaming and fallback requests off Vercel, and release both in hidden tabs. */
export function subscribeLiveData(options: {
  kind: "movements" | "satellites";
  pollMs: number;
  staleMs: number;
  onData: (body: unknown) => void;
  onError: () => void;
}) {
  let stream: EventSource | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let lastEvent = 0;

  function pause() {
    stream?.close();
    stream = undefined;
    controller?.abort();
    controller = undefined;
    clearTimeout(timer);
  }

  function resume() {
    pause();
    if (disposed || document.hidden) return;
    lastEvent = 0;
    const current = new AbortController();
    controller = current;
    const active = () => !disposed && !current.signal.aborted;
    const accept = (body: unknown) => {
      if (!active()) return;
      options.onData(body);
      lastEvent = Date.now();
    };
    stream = new EventSource(liveDataUrl(options.kind, "stream"));
    stream.onmessage = event => {
      try { accept(JSON.parse(event.data)); } catch { lastEvent = 0; }
    };
    stream.onerror = () => { if (active()) lastEvent = 0; };

    async function poll() {
      try {
        if (!lastEvent || Date.now() - lastEvent >= options.staleMs) {
          const response = await fetch(liveDataUrl(options.kind, "latest"), {
            cache: "no-store", signal: AbortSignal.any([current.signal, AbortSignal.timeout(10_000)]),
          });
          if (!response.ok) throw new Error("Live data unavailable");
          const body: unknown = await response.json();
          // An SSE frame may have arrived while the snapshot request was in flight.
          if (!lastEvent || Date.now() - lastEvent >= options.staleMs) accept(body);
        }
      } catch { if (active()) options.onError(); }
      finally { if (active()) timer = setTimeout(poll, options.pollMs); }
    }
    void poll();
  }

  document.addEventListener("visibilitychange", resume);
  resume();
  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", resume);
    pause();
  };
}
