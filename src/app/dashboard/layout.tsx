import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/auth/auth-context";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { CallProvider } from "@/components/call/call-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AuthProvider>
      <RealtimeProvider>
        <CallProvider>
          <DashboardShell>{children}</DashboardShell>
        </CallProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}