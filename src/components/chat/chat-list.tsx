"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, Phone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConnectionRequestDialog } from "@/components/connections/connection-request-dialog";
import type { User } from "@/lib/types";

interface ChatItem {
  connection_id: string;
  peer_id: string;
  peer: User;
  last_message?: string;
  last_at?: string;
}

export function ChatList() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = React.useState<ChatItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reqOpen, setReqOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

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
      conns.map(async (c: { id: string; user_a: string; user_b: string }) => {
        const peerId = c.user_a === user.id ? c.user_b : c.user_a;
        const { data: peer } = await supabase.from("mca_users").select("*").eq("id", peerId).single();
        const { data: last } = await supabase
          .from("mca_messages")
          .select("content, created_at")
          .eq("connection_id", c.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return {
          connection_id: c.id,
          peer_id: peerId,
          peer: peer as User,
          last_message: last?.content ?? "No messages yet",
          last_at: last?.created_at,
        } as ChatItem;
      }),
    );
    setItems(peers.filter((p) => p.peer));
    setLoading(false);
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((i) =>
    (i.peer.display_name ?? i.peer.phone_number).toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex w-full flex-col border-r md:w-80">
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button size="icon" variant="outline" onClick={() => setReqOpen(true)} aria-label="New connection">
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No chats yet. Add a connection to start messaging.
          </div>
        ) : (
          filtered.map((item) => (
            <button
              key={item.connection_id}
              onClick={() => router.push(`/dashboard/chat/${item.connection_id}`)}
              className="flex w-full items-center gap-3 border-b p-3 text-left transition-colors hover:bg-accent"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={item.peer.avatar ?? undefined} />
                <AvatarFallback>{(item.peer.display_name ?? item.peer.phone_number).slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {item.peer.display_name || item.peer.phone_number}
                </p>
                <p className="truncate text-xs text-muted-foreground">{item.last_message}</p>
              </div>
            </button>
          ))
        )}
      </div>

      <ConnectionRequestDialog open={reqOpen} onOpenChange={setReqOpen} />
    </div>
  );
}