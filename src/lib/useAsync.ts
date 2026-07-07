import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (d: T | null) => void;
}

/**
 * Run an async loader on mount; expose loading/error and a reload().
 *
 * The loader receives an AbortSignal that is aborted on unmount AND when a newer
 * run starts (deps change / reload mid-flight). Loaders that thread the signal
 * into `api.*({ signal })` get their in-flight request TRULY cancelled (no fetch
 * running past unmount, no closure held until resolve). Loaders that ignore the
 * signal still work — the monotonic runId + mounted ref block any stale setState.
 */
export function useAsync<T>(
  loader: (signal?: AbortSignal) => Promise<T>,
  deps: any[] = []
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const acRef = useRef<AbortController | null>(null);
  // Monotonic id so only the LATEST request can write state — a slow earlier
  // request that resolves after a newer one (deps changed / reload() called
  // mid-flight) is ignored, preventing stale data from overwriting fresh data.
  const runId = useRef(0);

  const run = useCallback(async () => {
    const id = ++runId.current;
    // Cancel any in-flight request before starting a new one.
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    const isCurrent = () => mounted.current && runId.current === id && !ac.signal.aborted;
    setError(null);
    try {
      const res = await loader(ac.signal);
      if (isCurrent()) setData(res);
    } catch (e: any) {
      if (ac.signal.aborted || e?.name === "AbortError") return; // ignore cancellations
      if (isCurrent()) setError(e?.message || "error");
    } finally {
      if (isCurrent()) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    run();
    return () => {
      mounted.current = false;
      acRef.current?.abort(); // cancel the in-flight request on unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return { data, loading, error, reload: run, setData };
}
