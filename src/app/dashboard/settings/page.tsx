"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun, Bell, Shield, Trash2, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function SettingsPage() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = React.useState(user?.display_name ?? "");
  const [avatar, setAvatar] = React.useState(user?.avatar ?? "");
  const [saving, setSaving] = React.useState(false);
  const [notifOn, setNotifOn] = React.useState(true);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setName(user?.display_name ?? "");
    setAvatar(user?.avatar ?? "");
  }, [user]);

  async function saveProfile() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: name, avatar: avatar || null }),
    });
    if (res.ok) {
      toast.success("Profile updated.");
      await refresh();
    } else {
      toast.error("Update failed.");
    }
    setSaving(false);
  }

  async function deleteAccount() {
    if (!confirm("Delete your account permanently? This cannot be undone.")) return;
    const res = await fetch("/api/profile", { method: "DELETE" });
    if (res.ok) {
      toast.success("Account deleted.");
      router.push("/login");
      router.refresh();
    } else {
      toast.error("Failed to delete account.");
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="border-b p-4">
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatar || undefined} />
                <AvatarFallback>{(name || user?.phone_number || "?").slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Display name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Avatar URL</label>
              <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" />
            </div>
            <Button onClick={saveProfile} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {mounted && theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span className="text-sm">Dark mode</span>
            </div>
            <Switch
              checked={mounted && theme === "dark"}
              onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="text-sm">Push notifications</span>
            </div>
            <Switch checked={notifOn} onCheckedChange={setNotifOn} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Privacy & Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> Your phone number is never publicly listed.
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> Only people who know your number can request to connect.
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={deleteAccount}>
              <Trash2 className="h-4 w-4" /> Delete account
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}