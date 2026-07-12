"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-context";
import type { AppNotification, SignalMessage, OutgoingSignal } from "@/lib/types";

export type RealtimeEvent =
  | { kind: "notification"; payload: AppNotification }
  | { kind: "signal"; payload: SignalMessage }
  | { kind: "presence"; userId: string; status: string };

const RealtimeContext = React.createContext<{
  subscribe: (cb: (e: RealtimeEvent) => void) => () => void;
} | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [channel, setChannel] = React.useState<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(
    null,
  );
  const listeners = React.useRef(new Set<(e: RealtimeEvent) => void>());

  const subscribe = React.useCallback((cb: (e: RealtimeEvent) => void) => {
    listeners.current.add(cb);
    return () => listeners.current.delete(cb);
  }, []);

  React.useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const ch = supabase.channel(`user:${user.id}`, {
      config: { presence: { key: user.id } },
    });

    ch.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "mca_notifications", filter: `user_id=eq.${user.id}` },
      (payload) => {
        listeners.current.forEach((cb) =>
          cb({ kind: "notification", payload: payload.new as AppNotification }),
        );
      },
    )
      .on("broadcast", { event: "signal" }, (payload) => {
        listeners.current.forEach((cb) => cb({ kind: "signal", payload: payload.payload as SignalMessage }));
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        Object.entries(state).forEach(([userId, presences]) => {
          const status = (presences as Array<{ status?: string }>)[0]?.status;
          if (status) {
            listeners.current.forEach((cb) => cb({ kind: "presence", userId, status }));
          }
        });
      })
      .subscribe();

    setChannel(ch);
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  const value = React.useMemo(() => ({ subscribe }), [subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}

/**
 * Send a WebRTC signaling message to a specific peer over the broadcast channel.
 */
export function useSignalSender() {
  const { user } = useAuth();
  return React.useCallback(
    async (to: string, msg: OutgoingSignal) => {
      if (!user) return;
      const supabase = createClient();
      await supabase.channel(`user:${to}`).send({
        type: "broadcast",
        event: "signal",
        payload: { ...msg, from: user.id, to } as SignalMessage,
      });
    },
    [user],
  );
}