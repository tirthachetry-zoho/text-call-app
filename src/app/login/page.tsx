"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Phone, User, Loader2, MessageSquare, PhoneCall, UserPlus, Bell, Ban } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function register() {
    setLoading(true);
    try {
      const phone_number = "+91" + phone.replace(/\D/g, "").slice(-10);
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number, display_name: name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Registration failed.");
        return;
      }
      // Establish the Supabase session from the signed token.
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (error) {
        toast.error("Session error: " + error.message);
        return;
      }
      toast.success("Welcome!");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const features = [
    { icon: UserPlus, label: "Connect by phone" },
    { icon: MessageSquare, label: "Realtime chat" },
    { icon: PhoneCall, label: "Voice calls" },
    { icon: Bell, label: "Notifications" },
    { icon: Ban, label: "Block users" },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-primary/10 via-background to-background p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Phone className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Connect</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in with your phone number and name
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Phone number</label>
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
            <p className="text-xs text-muted-foreground">
              Enter your 10-digit Indian mobile number.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Display name</label>
            <Input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>
          <Button
            className="w-full"
            onClick={register}
            disabled={loading || !phone || !name}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
            Continue
          </Button>
        </CardContent>
      </Card>

      <div className="w-full max-w-md">
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          What you can do
        </p>
        <ul className="grid grid-cols-2 gap-2">
          {features.map((f) => (
            <li
              key={f.label}
              className="flex items-center gap-2 rounded-lg border bg-card/50 px-3 py-2 text-sm"
            >
              <f.icon className="h-4 w-4 text-primary" />
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
