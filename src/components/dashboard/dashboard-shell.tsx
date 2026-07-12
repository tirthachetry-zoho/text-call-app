"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare,
  Users,
  UserPlus,
  Phone,
  Settings,
  LogOut,
  Moon,
  Sun,
  Bell,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-context";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, maskPhone } from "@/lib/utils";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { CallOverlay } from "@/components/call/call-overlay";

const NAV = [
  { key: "chats", label: "Chats", icon: MessageSquare, path: "/dashboard" },
  { key: "connections", label: "Connections", icon: Users, path: "/dashboard/connections" },
  { key: "requests", label: "Requests", icon: UserPlus, path: "/dashboard/requests" },
  { key: "calls", label: "Calls", icon: Phone, path: "/dashboard/calls" },
  { key: "settings", label: "Settings", icon: Settings, path: "/dashboard/settings" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut, loading } = useAuth();
  const { theme, setTheme } = useTheme();
  const { subscribe } = useRealtime();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // On mobile, hide the sidebar when viewing a conversation so the chat is
  // full-screen (a back button in the conversation returns to the list).
  const isChatRoute = pathname?.startsWith("/dashboard/chat");

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left Sidebar */}
      <aside
        className={cn(
          "flex w-16 flex-col items-center border-r bg-card py-4 md:w-64 md:items-stretch md:px-3",
          isChatRoute && "hidden md:flex",
        )}
      >
        <div className="mb-6 flex items-center gap-2 px-2 md:px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Phone className="h-5 w-5" />
          </div>
          <span className="hidden text-lg font-semibold md:block">Connect</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => router.push(item.path)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden md:block">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          <div className="hidden items-center gap-2 rounded-lg px-2 py-2 md:flex">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.avatar ?? undefined} />
              <AvatarFallback>{(user.display_name ?? user.phone_number).slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user.display_name || maskPhone(user.phone_number)}
              </p>
              <p className="truncate text-xs text-muted-foreground">{maskPhone(user.phone_number)}</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 md:justify-start">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {mounted && theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <NotificationBell subscribe={subscribe} />
            <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Center + Right */}
      <main className="flex flex-1 overflow-hidden">{children}</main>

      <CallOverlay />
    </div>
  );
}