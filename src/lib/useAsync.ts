import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (d: T | null) => void;
}

/** Run an async loader on mount; expose loading/error and a reload(). */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: any[] = []
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  // Monotonic id so only the LATEST request can write state — a slow earlier
  // request that resolves after a newer one (deps changed / reload() called
  // mid-flight) is ignored, preventing stale data from overwriting fresh data.
  const runId = useRef(0);

  const run = useCallback(async () => {
    const id = ++runId.current;
    const isCurrent = () => mounted.current && runId.current === id;
    setError(null);
    try {
      const res = await loader();
      if (isCurrent()) setData(res);
    } catch (e: any) {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return { data, loading, error, reload: run, setData };
}
