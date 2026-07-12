"use client";

import * as React from "react";
import { UserPlus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { User } from "@/lib/types";

interface RequestItem {
  id: string;
  sender_id: string;
  sender: User;
  created_at: string;
}

export default function RequestsPage() {
  const { user } = useAuth();
  const [items, setItems] = React.useState<RequestItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data: reqs } = await supabase
      .from("mca_connection_requests")
      .select("id, sender_id, created_at")
      .eq("receiver_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (!reqs) {
      setLoading(false);
      return;
    }
    const senders = await Promise.all(
      reqs.map(async (r: { id: string; sender_id: string; created_at: string }) => {
        const { data: sender } = await supabase
          .from("mca_users")
          .select("*")
          .eq("id", r.sender_id)
          .maybeSingle();
        return { id: r.id, sender_id: r.sender_id, sender: sender as User, created_at: r.created_at } as RequestItem;
      }),
    );
    setItems(senders.filter((s) => s.sender));
    setLoading(false);
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function respond(id: string, action: "accept" | "reject") {
    setBusy(id);
    try {
      const res = await fetch("/api/connections/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not respond to request.");
        return;
      }
      toast.success(action === "accept" ? "Connection accepted." : "Request rejected.");
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast.error("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">Requests</h1>
        <p className="text-sm text-muted-foreground">
          Pending connection requests from other users.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
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
            icon={<UserPlus className="h-10 w-10" />}
            title="No pending requests"
            description="When someone requests to connect, it will show up here."
          />
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 border-b p-4 transition-colors hover:bg-accent"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={item.sender.avatar ?? undefined} />
                <AvatarFallback>
                  {(item.sender.display_name ?? item.sender.phone_number).slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {item.sender.display_name || item.sender.phone_number}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.sender.phone_number}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => respond(item.id, "accept")}
                  disabled={busy === item.id}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => respond(item.id, "reject")}
                  disabled={busy === item.id}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Reject
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}