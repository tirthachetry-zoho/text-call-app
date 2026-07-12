"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ConnectionRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [phone, setPhone] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function send() {
    setLoading(true);
    try {
      const phone_number = "+91" + phone.replace(/\D/g, "").slice(-10);
      const res = await fetch("/api/connections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not send request.");
        return;
      }
      toast.success("Connection request sent.");
      setPhone("");
      onOpenChange(false);
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a connection</DialogTitle>
          <DialogDescription>
            Enter the phone number of the person you want to connect with. They must already be
            registered.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-stretch">
            <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              +91
            </span>
            <Input
              type="tel"
              inputMode="tel"
              placeholder="9500000001"
              className="rounded-l-none"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              disabled={loading}
            />
          </div>
          <Button className="w-full" onClick={send} disabled={loading || !phone}>
            {loading ? "Sending…" : "Send request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}