"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, Phone, Search, ArrowLeft, MoreVertical, Trash2, Paperclip, Smile, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-context";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { useCall } from "@/components/call/call-context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, maskPhone, timeAgo } from "@/lib/utils";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import {
  getCachedMessages,
  setCachedMessages,
  upsertCachedMessage,
} from "@/lib/chat-cache";
import type { Message, User } from "@/lib/types";

const EMOJIS = ["😀", "😂", "😍", "👍", "🙏", "🔥", "🎉", "❤️", "😎", "🤔", "👋", "✅"];

export function Conversation() {
  const params = useParams<{ id: string }>();
  const connectionId = params.id;
  const router = useRouter();
  const { user } = useAuth();
  const { subscribe, isOnline } = useRealtime();
  const { startCall } = useCall();

  const [peer, setPeer] = React.useState<User | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [typing, setTyping] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<Message[]>([]);
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const typingTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // The other participant's id for this connection. Kept in a ref so message
  // loading and the realtime handler don't depend on the whole `peer` object —
  // depending on `peer` would re-run the load effect and re-flash the loading
  // skeleton every time the peer resolves.
  const peerIdRef = React.useRef<string>("");

  const loadMessages = React.useCallback(
    async (before?: string) => {
      const pid = peerIdRef.current;
      if (!pid) return;
      const url = before
        ? `/api/messages?connection_id=${connectionId}&before=${encodeURIComponent(before)}`
        : `/api/messages?connection_id=${connectionId}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        const decrypted = await Promise.all(
          (data.messages as Message[]).map(async (m) => ({
            ...m,
            content: await decryptMessage(m.content, connectionId, user!.id, pid),
          })),
        );
        if (before) {
          setMessages((prev) => [...decrypted, ...prev]);
        } else {
          setMessages(decrypted);
          setCachedMessages(connectionId, decrypted);
        }
      }
    },
    [connectionId, user],
  );

  React.useEffect(() => {
    if (!user || !connectionId) return;
    let cancelled = false;
    const supabase = createClient();
    // Render cached history instantly, then revalidate in the background.
    const cached = getCachedMessages(connectionId);
    if (cached) {
      setMessages(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    // Resolve peer, then load messages — sequentially so messages are only
    // fetched once the peer id is known (decryption needs it). Running this
    // once (loadMessages is now stable) avoids re-flashing the loading
    // skeleton when the peer object resolves.
    (async () => {
      const { data: conn } = await supabase
        .from("mca_connections")
        .select("user_a, user_b")
        .eq("id", connectionId)
        .single();
      if (!conn || cancelled) return;
      const pid = conn.user_a === user.id ? conn.user_b : conn.user_a;
      peerIdRef.current = pid;
      const { data: p } = await supabase.from("mca_users").select("*").eq("id", pid).single();
      if (cancelled) return;
      setPeer((p as User) ?? null);
      await loadMessages();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, connectionId, loadMessages]);

  // Supabase realtime postgres changes for messages (live updates).
  React.useEffect(() => {
    if (!user || !connectionId) return;
    const supabase = createClient();
    // `createClient()` is a singleton, so `channel()` reuses a cached channel
    // by topic. Remove any pre-existing instance first to avoid re-using an
    // already-subscribed channel (e.g. across StrictMode double-invoke).
    supabase.removeChannel(supabase.channel(`messages:${connectionId}`));
    const ch = supabase
      .channel(`messages:${connectionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mca_messages", filter: `connection_id=eq.${connectionId}` },
        async (payload) => {
          const pid = peerIdRef.current;
          if (!pid) return;
          const m = payload.new as Message;
          const decrypted = { ...m, content: await decryptMessage(m.content, connectionId, user.id, pid) };
          if (payload.eventType === "INSERT") {
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, decrypted]));
            upsertCachedMessage(connectionId, decrypted);
            // Mark as read if we are the recipient.
            if (m.sender_id !== user.id) {
              fetch("/api/messages/receipt", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message_id: m.id, status: "read" }),
              });
            }
          } else if (payload.eventType === "UPDATE") {
            setMessages((prev) => prev.map((x) => (x.id === m.id ? decrypted : x)));
            upsertCachedMessage(connectionId, decrypted);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, connectionId]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim() || !user || !peer) return;
    const content = text.trim();
    setText("");
    // Encrypt before sending so the DB only ever stores ciphertext.
    const encrypted = await encryptMessage(content, connectionId, user.id, peer.id);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection_id: connectionId, content: encrypted }),
    });
    if (!res.ok) {
      toast.error("Failed to send message.");
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    const res = await fetch(
      `/api/messages/search?connection_id=${connectionId}&query=${encodeURIComponent(searchQuery)}`,
    );
    const data = await res.json();
    setSearchResults(data.messages ?? []);
  }

  async function deleteMessage(id: string) {
    const res = await fetch("/api/messages/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: id }),
    });
    if (res.ok) {
      const patch = { deleted_at: new Date().toISOString(), content: null as string | null };
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      const cached = getCachedMessages(connectionId);
      if (cached) {
        setCachedMessages(connectionId, cached.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      }
    }
  }

  function startEdit(m: Message) {
    setEditingId(m.id);
    setEditText(m.content ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text || !user || !peer) return;
    // Re-encrypt the edited content client-side; the server only stores ciphertext.
    const encrypted = await encryptMessage(text, connectionId, user.id, peer.id);
    const res = await fetch("/api/messages/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: id, content: encrypted }),
    });
    if (res.ok) {
      const patch = { content: text, edited_at: new Date().toISOString() };
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      const cached = getCachedMessages(connectionId);
      if (cached) {
        setCachedMessages(connectionId, cached.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      }
    } else {
      toast.error("Failed to edit message.");
    }
    cancelEdit();
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-16 w-2/3 self-end" />
        <Skeleton className="h-16 w-2/3" />
      </div>
    );
  }

  if (!peer) {
    return <div className="flex flex-1 items-center justify-center text-muted-foreground">Connection not found.</div>;
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b p-3">
        <Button
          size="icon"
          variant="ghost"
          className="md:hidden"
          onClick={() => router.push("/dashboard")}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={peer.avatar ?? undefined} />
          <AvatarFallback>{(peer.display_name ?? peer.phone_number).slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{peer.display_name || maskPhone(peer.phone_number)}</p>
          <p className="text-xs text-muted-foreground">
            {typing ? "typing…" : isOnline(peer.id) ? "online" : "offline"}
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => startCall(peer, connectionId)} aria-label="Call">
          <Phone className="h-5 w-5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setSearchOpen((v) => !v)} aria-label="Search">
          <Search className="h-5 w-5" />
        </Button>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-2 border-b bg-accent/30 p-2">
          <Input
            placeholder="Search in conversation"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button size="sm" onClick={handleSearch}>
            Search
          </Button>
          <Button size="icon" variant="ghost" onClick={() => { setSearchOpen(false); setSearchResults([]); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {searchResults.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-b bg-accent/20 p-2 text-sm">
          {searchResults.map((m) => (
            <p key={m.id} className="truncate border-b py-1 last:border-0">
              {m.content}
            </p>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          const isEditing = editingId === m.id;
          return (
            <div
              key={m.id}
              className={cn("group flex items-center gap-1", mine ? "justify-end" : "justify-start")}
            >
              {mine && !m.deleted_at && !isEditing && (
                <div className="flex flex-col opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
                  <button
                    onClick={() => startEdit(m)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteMessage(m.id)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div
                className={cn(
                  "relative max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                  mine ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {m.deleted_at ? (
                  <span className="italic opacity-70">This message was deleted</span>
                ) : isEditing ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit(m.id);
                        } else if (e.key === "Escape") {
                          cancelEdit();
                        }
                      }}
                      className="w-full resize-none rounded-md bg-background/90 p-2 text-foreground outline-none"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(m.id)} disabled={!editText.trim()}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap break-words">{m.content}</span>
                )}
                <div className={cn("mt-1 flex items-center gap-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  <span>{timeAgo(m.created_at)}</span>
                  {m.edited_at && !m.deleted_at && <span>· edited</span>}
                  {mine && m.status === "read" && <span>✓✓</span>}
                  {mine && m.status === "delivered" && <span>✓</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="relative border-t p-3">
        {showEmoji && (
          <div className="absolute bottom-16 left-3 flex flex-wrap gap-1 rounded-lg border bg-card p-2 shadow-lg">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setText((t) => t + e)}
                className="rounded p-1 text-xl hover:bg-accent"
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => setShowEmoji((v) => !v)} aria-label="Emoji">
            <Smile className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Attach">
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            placeholder="Type a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <Button size="icon" onClick={send} disabled={!text.trim()} aria-label="Send">
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}