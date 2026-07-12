"use client";

import * as React from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { maskPhone } from "@/lib/utils";
import type { User } from "@/lib/types";

interface CallLog {
  id: string;
  peer_id: string;
  direction: "incoming" | "outgoing";
  status: string;
  duration_seconds: number;
  created_at: string;
  peer?: User;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CallsPage() {
  const { user } = useAuth();
  const [items, setItems] = React.useState<CallLog[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data: logs } = await supabase
      .from("mca_call_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!logs) {
      setLoading(false);
      return;
    }
    const withPeers = await Promise.all(
      logs.map(async (log: CallLog) => {
        const { data: peer } = await supabase
          .from("mca_users")
          .select("*")
          .eq("id", log.peer_id)
          .maybeSingle();
        return { ...log, peer: peer as User } as CallLog;
      }),
    );
    setItems(withPeers);
    setLoading(false);
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  function Icon({ log }: { log: CallLog }) {
    if (log.status === "rejected" || log.status === "missed") {
      return <PhoneMissed className="h-4 w-4 text-destructive" />;
    }
    if (log.direction === "incoming") {
      return <PhoneIncoming className="h-4 w-4 text-emerald-500" />;
    }
    return <PhoneOutgoing className="h-4 w-4 text-primary" />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">Calls</h1>
        <p className="text-sm text-muted-foreground">Your call history.</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b p-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Phone className="h-10 w-10" />}
            title="No calls yet"
            description="Your call history will appear here."
          />
        ) : (
          items.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-3 border-b p-4 transition-colors hover:bg-accent"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={log.peer?.avatar ?? undefined} />
                <AvatarFallback>
                  {(log.peer?.display_name ?? log.peer?.phone_number ?? "??").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {log.peer?.display_name || (log.peer?.phone_number ? maskPhone(log.peer.phone_number) : "Unknown")}
                </p>
                <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Icon log={log} />
                  {log.direction === "incoming" ? "Incoming" : "Outgoing"}
                  {log.status === "completed" && log.duration_seconds > 0
                    ? ` · ${formatDuration(log.duration_seconds)}`
                    : ` · ${log.status}`}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}