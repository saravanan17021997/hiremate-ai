// Small hook: call a window.hiremate function and track loading / data / error.
import { useCallback, useEffect, useState } from "react";
import type { IpcResult } from "@shared/ipc";

export function useIpc<T>(call: () => Promise<IpcResult<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!window.hiremate) throw new Error("The app bridge is missing. Restart HireMate AI.");
      const result = await call();
      if (result.ok) setData(result.data);
      else setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}
