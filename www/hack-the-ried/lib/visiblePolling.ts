/** No overlapping work, hidden-tab requests or off-screen chart polling. */
export function pollVisible(task: (signal: AbortSignal) => Promise<number | void>, intervalMs: number, options: {
  target?: Element; once?: boolean; onPause?: () => void;
} = {}) {
  let intersecting = !options.target || typeof IntersectionObserver === "undefined";
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let completed = false;
  function pause() {
    controller?.abort(); controller = undefined; clearTimeout(timer);
    options.onPause?.();
  }
  async function run() {
    if (disposed || document.hidden || !intersecting || (options.once && completed)) return;
    const current = new AbortController(); controller = current;
    let delay: number | void = undefined;
    try { delay = await task(current.signal); completed = true; }
    catch { /* Callers render their domain-specific error state. */ }
    finally {
      if (!current.signal.aborted && !disposed && !options.once) timer = setTimeout(run, typeof delay === "number" ? Math.max(1000, delay) : intervalMs);
    }
  }
  function visibility() { pause(); if (!document.hidden && intersecting) void run(); }
  const observer = options.target && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => {
    const next = entries.some(entry => entry.isIntersecting);
    if (next !== intersecting) { intersecting = next; visibility(); }
  }, { rootMargin: "0px" }) : undefined;
  if (observer && options.target) observer.observe(options.target);
  document.addEventListener("visibilitychange", visibility);
  void run();
  return () => { disposed = true; pause(); observer?.disconnect(); document.removeEventListener("visibilitychange", visibility); };
}
