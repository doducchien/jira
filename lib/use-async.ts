"use client";

import { useCallback, useEffect, useState, type DependencyList } from "react";

export type AsyncState<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
};

/**
 * Runs `fn` whenever `deps` (JSON-serialisable) change; stale responses are dropped.
 * Previous data is kept while reloading.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [tick, setTick] = useState(0);
  const key = JSON.stringify([...deps, tick]);
  const [state, setState] = useState<{ key: string | null; data?: T; error: unknown }>({ key: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fn().then(
      (data) => !cancelled && setState({ key, data, error: null }),
      (error) => !cancelled && setState((s) => ({ key, data: s.data, error })),
    );
    return () => {
      cancelled = true;
    };
    // `fn` closes over the values captured in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = state.key === key;
  return { data: state.data, error: current ? state.error : null, loading: !current, reload };
}
