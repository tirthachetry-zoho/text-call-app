"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-context";
import type { AppNotification, SignalMessage, OutgoingSignal } from "@/lib/types";

export type RealtimeEvent =
  | { kind: "notification"; payload: AppNotification }
  | { kind: "signal"; payload: SignalMessage }
  | { kind: "presence"; userId: string; status: string };

// A single shared channel that every connected client joins. Presence state
// here is synced by the Realtime server over the websocket, so online/offline
// changes propagate to all subscribers within milliseconds.
const PRESENCE_CHANNEL = "global-presence";

const RealtimeContext = React.createContext<{
  subscribe: (cb: (e: RealtimeEvent) => void) => () => void;
  isOnline: (userId: string) => boolean;
  onlineUsers: Set<string>;
} | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = React.useState<Set<string>>(new Set());
  const listeners = React.useRef(new Set<(e: RealtimeEvent) => void>());

  const subscribe = React.useCallback((cb: (e: RealtimeEvent) => void) => {
    listeners.current.add(cb);
    return () => listeners.current.delete(cb);
  }, []);

  const isOnline = React.useCallback(
    (userId: string) => onlineUsers.has(userId),
    [onlineUsers],
  );

  React.useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    // Personal channel: incoming notifications + WebRTC signaling.
    const personal = supabase.channel(`user:${user.id}`, {
      config: { presence: { key: user.id } },
    });

    personal
      .on(
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
      .subscribe();

    // Shared presence channel: track who is online in real-time.
    const presence = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: user.id } },
    });

    const syncOnline = () => {
      const state = presence.presenceState<{ online?: boolean }>();
      const ids = new Set<string>();
      for (const [key, presences] of Object.entries(state)) {
        const isOnline = (presences as Array<{ online?: boolean }>)[0]?.online;
        if (isOnline) ids.add(key);
      }
      setOnlineUsers(ids);
    };

    presence
      .on("presence", { event: "sync" }, syncOnline)
      .on("presence", { event: "join" }, syncOnline)
      .on("presence", { event: "leave" }, syncOnline)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presence.track({ online: true });
          // Persist our online state to the presence table as a fallback /
          // for clients that cannot use the realtime channel.
          await supabase
            .from("mca_presence")
            .upsert({ user_id: user.id, status: "online", updated_at: new Date().toISOString() }, { onConflict: "user_id" })
            .throwOnError();
        }
      });

    // Mark ourselves offline when the tab is hidden / closed.
    const markOffline = () => {
      presence.untrack();
      supabase
        .from("mca_presence")
        .update({ status: "offline", updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .then(() => supabase.removeChannel(presence));
    };
    window.addEventListener("beforeunload", markOffline);

    return () => {
      window.removeEventListener("beforeunload", markOffline);
      supabase.removeChannel(personal);
      markOffline();
    };
  }, [user]);

  const value = React.useMemo(
    () => ({ subscribe, isOnline, onlineUsers }),
    [subscribe, isOnline, onlineUsers],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}

/**
 * Send a WebRTC signaling message to a specific peer over the broadcast channel.
 * We join the target's personal channel before sending so the broadcast is
 * reliably tracked/routed by the Realtime server, then leave it afterwards.
 */
export function useSignalSender() {
  const { user } = useAuth();
  return React.useCallback(
    async (to: string, msg: OutgoingSignal) => {
      if (!user) return;
      const supabase = createClient();
      const ch = supabase.channel(`user:${to}`);
      await ch.subscribe();
      await ch.send({
        type: "broadcast",
        event: "signal",
        payload: { ...msg, from: user.id, to } as SignalMessage,
      });
      // Give the server a moment to flush, then clean up.
      setTimeout(() => supabase.removeChannel(ch), 500);
    },
    [user],
  );
}