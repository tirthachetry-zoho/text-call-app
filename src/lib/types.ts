// Shared domain types mirroring the Supabase schema.

export type UserStatus = "online" | "offline" | "away";
export type ConnectionStatus = "pending" | "accepted" | "rejected" | "removed";
export type MessageStatus = "sent" | "delivered" | "read";
export type CallStatus = "missed" | "completed" | "rejected" | "ongoing";
export type NotificationType =
  | "connection_request"
  | "connection_accepted"
  | "connection_rejected"
  | "message"
  | "incoming_call"
  | "missed_call";

export interface User {
  id: string;
  phone_number: string;
  display_name: string | null;
  avatar: string | null;
  status: UserStatus;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectionRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
}

export interface Connection {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  muted: boolean;
}

export interface Message {
  id: string;
  connection_id: string;
  sender_id: string;
  content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  status: MessageStatus;
  deleted_at: string | null;
  created_at: string;
}

export interface Call {
  id: string;
  connection_id: string;
  caller_id: string;
  callee_id: string;
  status: CallStatus;
  started_at: string;
  ended_at: string | null;
}

export interface CallLog {
  id: string;
  call_id: string;
  user_id: string;
  peer_id: string;
  direction: "incoming" | "outgoing";
  status: CallStatus;
  duration_seconds: number;
  created_at: string;
}

export interface BlockedUser {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  reference_id: string | null;
  read: boolean;
  created_at: string;
}

export interface Presence {
  user_id: string;
  status: UserStatus;
  updated_at: string;
}

// WebRTC signaling payloads exchanged over Supabase Realtime.
export type SignalMessage =
  | { type: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit; callId: string }
  | { type: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit; callId: string }
  | { type: "ice-candidate"; from: string; to: string; candidate: RTCIceCandidateInit; callId: string }
  | { type: "call-ended"; from: string; to: string; callId: string }
  | { type: "call-accepted"; from: string; to: string; callId: string }
  | { type: "call-rejected"; from: string; to: string; callId: string }
  | { type: "call-cancelled"; from: string; to: string; callId: string };

// Distributive Omit so each union member keeps its own fields.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// Signal payload sent by the app before the `from`/`to`/`callId` envelope is added.
export type OutgoingSignal = DistributiveOmit<SignalMessage, "from" | "to" | "callId">;
