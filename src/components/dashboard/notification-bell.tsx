"use client";

import * as React from "react";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppNotification } from "@/lib/types";
import type { RealtimeEvent } from "@/components/realtime/realtime-provider";

export function NotificationBell({
  subscribe,
}: {
  subscribe: (cb: (e: RealtimeEvent) => void) => () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [unread, setUnread] = React.useState(0);

  React.useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.notifications ?? []);
        setUnread((d.notifications ?? []).filter((n: AppNotification) => !n.read).length);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    const unsub = subscribe((e) => {
      if (e.kind === "notification") {
        const n = e.payload as AppNotification;
        setItems((prev) => [n, ...prev]);
        setUnread((u) => u + 1);
        toast(n.title, { description: n.body ?? undefined });
      }
    });
    return unsub;
  }, [subscribe]);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH", body: JSON.stringify({}) });
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Notifications">
        <div className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread}
            </span>
          )}
        </div>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Notifications
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                <Check className="h-4 w-4" /> Mark all read
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {items.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border p-3 text-sm ${n.read ? "opacity-60" : "bg-accent/40"}`}
              >
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="text-muted-foreground">{n.body}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}