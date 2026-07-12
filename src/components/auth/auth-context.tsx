"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setUser(null);
      return;
    }
    const { data } = await supabase
      .from("mca_users")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();
    setUser((data as User) ?? null);
  }, []);

  React.useEffect(() => {
    refresh().finally(() => setLoading(false));

    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const signOut = React.useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}