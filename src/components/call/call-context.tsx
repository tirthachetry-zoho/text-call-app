"use client";

import * as React from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useRealtime, useSignalSender } from "@/components/realtime/realtime-provider";
import { createClient } from "@/lib/supabase/client";
import type { SignalMessage, OutgoingSignal, User } from "@/lib/types";

export type CallState =
  | { status: "idle" }
  | { status: "outgoing"; peer: User; callId: string; connectionId: string }
  | { status: "incoming"; peer: User; callId: string; connectionId: string }
  | { status: "connected"; peer: User; callId: string; connectionId: string; startedAt: number };

interface CallContextValue {
  call: CallState;
  startCall: (peer: User, connectionId: string) => Promise<void>;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
  end: () => Promise<void>;
  cancel: () => Promise<void>;
  toggleMute: () => void;
  muted: boolean;
  remoteStream: MediaStream | null;
}

const CallContext = React.createContext<CallContextValue | null>(null);

// RTCPeerConnection with a custom field used to stash the incoming offer
// until the user accepts the call.
interface PeerWithOffer extends RTCPeerConnection {
  _pendingOffer?: RTCSessionDescriptionInit;
}

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const sendSignal = useSignalSender();
  const [call, setCall] = React.useState<CallState>({ status: "idle" });
  const [muted, setMuted] = React.useState(false);
  const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(null);

  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const remoteStreamRef = React.useRef<MediaStream | null>(null);
  const callIdRef = React.useRef<string | null>(null);

  const cleanup = React.useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setRemoteStream(null);
    callIdRef.current = null;
  }, []);

  const ensureStream = React.useCallback(async () => {
    if (!localStreamRef.current) {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    return localStreamRef.current;
  }, []);

  const setupPeer = React.useCallback(
    (peerId: string) => {
      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      // Add local tracks if we already have them (caller side).
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(peerId, { type: "ice-candidate", candidate: e.candidate.toJSON() });
        }
      };

      pc.ontrack = (e) => {
        // Build a dedicated remote stream from the received track. Relying on
        // `e.streams[0]` is fragile — when the peer used `addTrack(track, stream)`
        // the event's `streams` array is often empty, which left the audio
        // element with `srcObject = undefined` and produced no sound.
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(e.track);
        setRemoteStream(remoteStreamRef.current);
      };
      return pc;
    },
    [sendSignal],
  );

  // Add the local microphone stream to an already-created peer connection
  // (used on the callee side, after the user accepts and grants mic access).
  const attachLocalStream = React.useCallback(() => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream) return;
    stream.getTracks().forEach((track) => {
      // Avoid adding the same track twice.
      if (pc.getSenders().some((s) => s.track === track)) return;
      pc.addTrack(track, stream);
    });
  }, []);

  const startCall = React.useCallback(
    async (peer: User, connectionId: string) => {
      if (!user) return;
      const stream = await ensureStream();
      const supabase = createClient();
      const { data: callRow } = await supabase
        .from("mca_calls")
        .insert({
          connection_id: connectionId,
          caller_id: user.id,
          callee_id: peer.id,
          status: "ongoing",
        })
        .select("id")
        .single();

      const callId = callRow!.id;
      callIdRef.current = callId;
      setCall({ status: "outgoing", peer, callId, connectionId });

      const pc = setupPeer(peer.id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(peer.id, { type: "offer", sdp: offer });
    },
    [user, ensureStream, setupPeer, sendSignal],
  );

  const accept = React.useCallback(async () => {
    if (call.status !== "incoming") return;
    const stream = await ensureStream();
    // Reuse the SAME peer connection that received the offer (it already
    // holds the pending offer). Creating a new one would lose it.
    const pc = pcRef.current as PeerWithOffer | null;
    if (!pc || !pc._pendingOffer) return;
    attachLocalStream();
    await pc.setRemoteDescription(pc._pendingOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal(call.peer.id, { type: "answer", sdp: answer });
    await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: call.callId, action: "accept" }),
    });
    setCall({ ...call, status: "connected", startedAt: Date.now() });
  }, [call, ensureStream, attachLocalStream, sendSignal]);

  const reject = React.useCallback(async () => {
    if (call.status !== "incoming") return;
    await sendSignal(call.peer.id, { type: "call-rejected" });
    await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: call.callId, action: "reject" }),
    });
    cleanup();
    setCall({ status: "idle" });
  }, [call, sendSignal, cleanup]);

  const end = React.useCallback(async () => {
    if (call.status === "idle") return;
    await sendSignal(call.peer.id, { type: "call-ended" });
    await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: call.callId, action: "end" }),
    });
    cleanup();
    setCall({ status: "idle" });
  }, [call, sendSignal, cleanup]);

  const cancel = React.useCallback(async () => {
    if (call.status !== "outgoing") return;
    await sendSignal(call.peer.id, { type: "call-cancelled" });
    await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: call.callId, action: "cancel" }),
    });
    cleanup();
    setCall({ status: "idle" });
  }, [call, sendSignal, cleanup]);

  const toggleMute = React.useCallback(() => {
    const next = !muted;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  }, [muted]);

  // Handle incoming signaling.
  React.useEffect(() => {
    const unsub = subscribe((e) => {
      if (e.kind !== "signal") return;
      const msg = e.payload as SignalMessage;
      if (msg.to !== user?.id) return;

      if (msg.type === "offer") {
        // Incoming call.
        const supabase = createClient();
        supabase
          .from("mca_users")
          .select("*")
          .eq("id", msg.from)
          .single()
          .then(async ({ data: peer }) => {
            if (!peer) return;
            // Resolve connection id from an existing call row.
            const { data: callRow } = await supabase
              .from("mca_calls")
              .select("id, connection_id")
              .eq("id", msg.callId ?? "")
              .maybeSingle();
            const connectionId = callRow?.connection_id ?? "";
            const cid = callRow?.id ?? crypto.randomUUID();
            callIdRef.current = cid;
            // Create the peer connection now and stash the offer so accept()
            // can reuse the exact same pc.
            const pc = setupPeer(msg.from) as PeerWithOffer;
            pc._pendingOffer = msg.sdp;
            setCall({
              status: "incoming",
              peer: peer as User,
              callId: cid,
              connectionId,
            });
          });
      } else if (msg.type === "answer" && pcRef.current) {
        pcRef.current.setRemoteDescription(msg.sdp);
        if (call.status === "outgoing") {
          setCall({ ...call, status: "connected", startedAt: Date.now() });
        }
      } else if (msg.type === "ice-candidate" && pcRef.current) {
        pcRef.current.addIceCandidate(msg.candidate).catch(() => {});
      } else if (msg.type === "call-ended" || msg.type === "call-rejected" || msg.type === "call-cancelled") {
        cleanup();
        setCall({ status: "idle" });
      }
    });
    return unsub;
  }, [subscribe, user, call, setupPeer, cleanup]);

  const value = React.useMemo(
    () => ({ call, startCall, accept, reject, end, cancel, toggleMute, muted, remoteStream }),
    [call, startCall, accept, reject, end, cancel, toggleMute, muted, remoteStream],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = React.useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}