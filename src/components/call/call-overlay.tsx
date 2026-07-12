"use client";

import * as React from "react";
import { Phone, PhoneOff, Mic, MicOff, Loader2 } from "lucide-react";
import { useCall } from "@/components/call/call-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";

export function CallOverlay() {
  const { call, accept, reject, end, cancel, toggleMute, muted } = useCall();
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (call.status !== "connected") return;
    const start = call.startedAt;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [call]);

  if (call.status === "idle") return null;

  const peer = call.peer;
  const isIncoming = call.status === "incoming";
  const isOutgoing = call.status === "outgoing";
  const isConnected = call.status === "connected";

  return (
    <>
      <audio id="remote-audio" autoPlay />
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl bg-card p-8 shadow-2xl">
          <Avatar className="h-24 w-24">
            <AvatarImage src={peer.avatar ?? undefined} />
            <AvatarFallback className="text-2xl">
              {(peer.display_name ?? peer.phone_number).slice(0, 2)}
            </AvatarFallback>
          </Avatar>

          <div className="text-center">
            <p className="text-lg font-semibold">{peer.display_name || peer.phone_number}</p>
            <p className="text-sm text-muted-foreground">
              {isIncoming && "Incoming call…"}
              {isOutgoing && "Calling…"}
              {isConnected && formatDuration(elapsed)}
            </p>
          </div>

          {isConnected && (
            <div className="flex items-center gap-3">
              <Button
                variant={muted ? "destructive" : "secondary"}
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="h-14 w-14 rounded-full"
                onClick={end}
                aria-label="End call"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
            </div>
          )}

          {isIncoming && (
            <div className="flex items-center gap-6">
              <Button
                variant="destructive"
                size="icon"
                className="h-14 w-14 rounded-full"
                onClick={reject}
                aria-label="Reject"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <Button
                variant="default"
                size="icon"
                className="h-14 w-14 rounded-full bg-primary"
                onClick={accept}
                aria-label="Accept"
              >
                <Phone className="h-6 w-6" />
              </Button>
            </div>
          )}

          {isOutgoing && (
            <Button
              variant="destructive"
              size="icon"
              className="h-14 w-14 rounded-full"
              onClick={cancel}
              aria-label="Cancel"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}