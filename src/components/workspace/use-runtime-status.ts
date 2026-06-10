"use client";

import { useEffect, useState } from "react";
import type { RuntimeStatus } from "@/services/runtime-status";

async function fetchRuntimeStatus() {
  const response = await fetch("/api/runtime-status");

  if (!response.ok) {
    throw new Error("Runtime status could not be read.");
  }

  return (await response.json()) as RuntimeStatus;
}

export function useRuntimeStatus({
  initialRuntimeStatus,
  runtimeStatusFetcher = fetchRuntimeStatus,
}: {
  initialRuntimeStatus?: RuntimeStatus;
  runtimeStatusFetcher?: () => Promise<RuntimeStatus>;
}) {
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(
    initialRuntimeStatus ?? null,
  );

  useEffect(() => {
    let isMounted = true;

    if (initialRuntimeStatus) {
      return () => {
        isMounted = false;
      };
    }

    void runtimeStatusFetcher()
      .then((status) => {
        if (!isMounted) {
          return;
        }

        setRuntimeStatus(status);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [initialRuntimeStatus, runtimeStatusFetcher]);

  return runtimeStatus;
}
