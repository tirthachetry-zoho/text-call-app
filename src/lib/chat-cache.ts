// In-memory caches so chats render instantly from a previous visit and are
// revalidated in the background. Keyed by user id (chat list) and connection
// id (message history). Module-level so the cache survives component
// remounts / navigation within a tab. Realtime updates keep these fresh.

import type { ChatItem, Message } from "@/lib/types";

const listCache = new Map<string, ChatItem[]>();
const messageCache = new Map<string, Message[]>();

// How long a cached entry is considered fresh enough to skip a network fetch.
const LIST_TTL_MS = 30_000;
const MESSAGE_TTL_MS = 15_000;

const listTimestamps = new Map<string, number>();
const messageTimestamps = new Map<string, number>();

export function getCachedChatList(userId: string): ChatItem[] | null {
  const items = listCache.get(userId);
  const ts = listTimestamps.get(userId);
  if (!items || ts === undefined) return null;
  if (Date.now() - ts > LIST_TTL_MS) return null;
  return items;
}

export function setCachedChatList(userId: string, items: ChatItem[]): void {
  listCache.set(userId, items);
  listTimestamps.set(userId, Date.now());
}

export function getCachedMessages(connectionId: string): Message[] | null {
  const items = messageCache.get(connectionId);
  const ts = messageTimestamps.get(connectionId);
  if (!items || ts === undefined) return null;
  if (Date.now() - ts > MESSAGE_TTL_MS) return null;
  return items;
}

export function setCachedMessages(connectionId: string, messages: Message[]): void {
  messageCache.set(connectionId, messages);
  messageTimestamps.set(connectionId, Date.now());
}

// Merge a single incoming message into the cached history (used by realtime
// handlers) so the cache stays authoritative without a refetch.
export function upsertCachedMessage(connectionId: string, message: Message): void {
  const existing = messageCache.get(connectionId);
  if (!existing) return;
  const next = existing.some((m) => m.id === message.id)
    ? existing.map((m) => (m.id === message.id ? message : m))
    : [...existing, message];
  setCachedMessages(connectionId, next);
}

// Update the cached chat-list preview for a connection (used by realtime
// handlers) so the list reflects the latest message without a refetch.
export function updateCachedChatPreview(
  userId: string,
  connectionId: string,
  patch: Partial<ChatItem>,
): void {
  const existing = listCache.get(userId);
  if (!existing) return;
  const next = existing.map((i) =>
    i.connection_id === connectionId ? { ...i, ...patch } : i,
  );
  setCachedChatList(userId, next);
}