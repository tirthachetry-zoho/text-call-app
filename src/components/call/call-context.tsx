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
}

const CallContext = React.createContext<CallContextValue | null>(null);

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

      localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(peerId, { type: "ice-candidate", candidate: e.candidate.toJSON() });
        }
      };

      pc.ontrack = (e) => {
        remoteStreamRef.current = e.streams[0];
        // Attach to a hidden audio element for playback.
        const audio = document.getElementById("remote-audio") as HTMLAudioElement | null;
        if (audio) {
          audio.srcObject = e.streams[0];
        }
      };
      return pc;
    },
    [sendSignal],
  );

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
    const pc = setupPeer(call.peer.id);
    const offer = (pc as any)._pendingOffer as RTCSessionDescriptionInit;
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal(call.peer.id, { type: "answer", sdp: answer });
    await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: call.callId, action: "accept" }),
    });
    setCall({ ...call, status: "connected", startedAt: Date.now() });
  }, [call, ensureStream, setupPeer, sendSignal]);

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
              .eq("id", (msg as any).callId ?? "")
              .maybeSingle();
            const connectionId = callRow?.connection_id ?? "";
            const cid = callRow?.id ?? crypto.randomUUID();
            callIdRef.current = cid;
            setCall({
              status: "incoming",
              peer: peer as User,
              callId: cid,
              connectionId,
            });
            // Stash the offer for accept().
            const pc = setupPeer(msg.from);
            (pc as any)._pendingOffer = msg.sdp;
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
    () => ({ call, startCall, accept, reject, end, cancel, toggleMute, muted }),
    [call, startCall, accept, reject, end, cancel, toggleMute, muted],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = React.useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}