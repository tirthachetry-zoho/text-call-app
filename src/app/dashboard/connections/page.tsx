"use client";

import * as React from "react";
import { Users, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { User } from "@/lib/types";

interface ConnectionItem {
  connection_id: string;
  peer_id: string;
  peer: User;
}

export default function ConnectionsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = React.useState<ConnectionItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data: conns } = await supabase
      .from("mca_connections")
      .select("id, user_a, user_b")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    if (!conns) {
      setLoading(false);
      return;
    }
    const peers = await Promise.all(
      conns.map(async (c: any) => {
        const peerId = c.user_a === user.id ? c.user_b : c.user_a;
        const { data: peer } = await supabase
          .from("mca_users")
          .select("*")
          .eq("id", peerId)
          .maybeSingle();
        return { connection_id: c.id, peer_id: peerId, peer: peer as User } as ConnectionItem;
      }),
    );
    setItems(peers.filter((p) => p.peer));
    setLoading(false);
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">Connections</h1>
        <p className="text-sm text-muted-foreground">
          People you're connected with.
        </p>
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
            icon={<Users className="h-10 w-10" />}
            title="No connections yet"
            description="Send a connection request to start chatting."
          />
        ) : (
          items.map((item) => (
            <div
              key={item.connection_id}
              className="flex items-center gap-3 border-b p-4 transition-colors hover:bg-accent"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={item.peer.avatar ?? undefined} />
                <AvatarFallback>
                  {(item.peer.display_name ?? item.peer.phone_number).slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {item.peer.display_name || item.peer.phone_number}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.peer.phone_number}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/dashboard/chat/${item.connection_id}`)}
              >
                <MessageSquare className="mr-1.5 h-4 w-4" />
                Message
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}