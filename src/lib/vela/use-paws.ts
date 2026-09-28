/**
 * Pfoten balance for the signed-in member, and the ticker that earns them:
 * every minute the tab is visible, the server is told "still here".
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collectPaws } from "@/lib/vela/server";
import { useAppSession } from "@/lib/vela/app-session";
import { TICK_SECONDS } from "@/lib/vela/shop";

export const PAWS_KEY = ["paws"] as const;

export function usePaws() {
  const { profile } = useAppSession();
  return useQuery({
    queryKey: PAWS_KEY,
    queryFn: () => collectPaws({ data: { tick: false } }),
    enabled: Boolean(profile),
    staleTime: 30_000,
  });
}

export function usePawTicker(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      collectPaws({ data: { tick: true } })
        .then((status) => queryClient.setQueryData(PAWS_KEY, status))
        .catch(() => undefined);
    }, TICK_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [enabled, queryClient]);
}
