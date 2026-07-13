"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConnectionRequestDialog } from "@/components/connections/connection-request-dialog";
import { maskPhone, cn } from "@/lib/utils";
import { decryptMessage } from "@/lib/crypto";
import {
  getCachedChatList,
  setCachedChatList,
  updateCachedChatPreview,
} from "@/lib/chat-cache";
import type { ChatItem, User } from "@/lib/types";

export function ChatList() {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline } = useRealtime();
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
        // Decrypt the preview up-front so the list never flashes encrypted text.
        const last_message = last?.content
          ? await decryptMessage(last.content, c.id, user.id, peerId)
          : "No messages yet";
        return {
          connection_id: c.id,
          peer_id: peerId,
          peer: peer as User,
          last_message,
          last_at: last?.created_at,
        } as ChatItem;
      }),
    );
    const valid = peers.filter((p) => p.peer);
    setItems(valid);
    setCachedChatList(user.id, valid);
    setLoading(false);
  }, [user]);

  React.useEffect(() => {
    if (!user) return;
    // Render cached chats instantly, then revalidate in the background.
    const cached = getCachedChatList(user.id);
    if (cached) {
      setItems(cached);
      setLoading(false);
    }
    load();
  }, [load, user]);

  // Realtime: keep the last-message preview fresh as new messages arrive.
  // We decrypt the incoming message immediately and store the decrypted
  // preview directly on the item, so there is a single source of truth and
  // no flicker between an encrypted value and a separately-decrypted one.
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  React.useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    // `createClient()` is a singleton, so `channel()` reuses a cached channel
    // by topic. Remove any pre-existing instance first to avoid re-using an
    // already-subscribed channel (e.g. across StrictMode double-invoke).
    supabase.removeChannel(supabase.channel("chat-list-messages"));
    const ch = supabase
      .channel("chat-list-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mca_messages" },
        async (payload) => {
          const m = payload.new as { connection_id: string; sender_id: string; content: string | null };
          if (!m.content) return;

          const target = itemsRef.current.find((i) => i.connection_id === m.connection_id);
          if (!target) return;

          const decrypted = await decryptMessage(m.content, m.connection_id, user.id, target.peer_id);
          const preview = `${m.sender_id === user.id ? "You: " : ""}${decrypted}`;

          setItems((prev) => {
            const existingTarget = prev.find((i) => i.connection_id === m.connection_id);
            if (!existingTarget) return prev;
            return [
              { ...existingTarget, last_message: preview, last_at: new Date().toISOString() },
              ...prev.filter((i) => i.connection_id !== m.connection_id),
            ];
          });
          if (user) {
            updateCachedChatPreview(user.id, m.connection_id, {
              last_message: preview,
              last_at: new Date().toISOString(),
            });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

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
          filtered.map((item) => {
            const online = isOnline(item.peer_id);
            return (
              <button
                key={item.connection_id}
                onClick={() => router.push(`/dashboard/chat/${item.connection_id}`)}
                className="flex w-full items-center gap-3 border-b p-3 text-left transition-colors hover:bg-accent"
              >
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={item.peer.avatar ?? undefined} />
                    <AvatarFallback>{(item.peer.display_name ?? item.peer.phone_number).slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                      online ? "bg-green-500" : "bg-muted-foreground/40",
                    )}
                    title={online ? "Online" : "Offline"}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.peer.display_name || maskPhone(item.peer.phone_number)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.last_message}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      <ConnectionRequestDialog open={reqOpen} onOpenChange={setReqOpen} />
    </div>
  );
}