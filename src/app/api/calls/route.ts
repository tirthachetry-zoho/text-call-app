import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callActionSchema } from "@/lib/validations";

/**
 * GET /api/calls
 * Returns the current user's call logs.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("mca_call_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ calls: data ?? [] });
}

/**
 * POST /api/calls
 * Body: { call_id, action: "accept" | "reject" | "end" | "cancel" }
 * Updates a call's status and writes a call_log entry.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = callActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { call_id, action } = parsed.data;

  const { data: call, error: callErr } = await supabase
    .from("mca_calls")
    .select("*")
    .eq("id", call_id)
    .single();
  if (callErr || !call) {
    return NextResponse.json({ error: "Call not found." }, { status: 404 });
  }

  const isCaller = call.caller_id === user.id;
  const isCallee = call.callee_id === user.id;
  if (!isCaller && !isCallee) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let newStatus = call.status;
  if (action === "accept") newStatus = "ongoing";
  if (action === "reject") newStatus = "rejected";
  if (action === "end" || action === "cancel") newStatus = "completed";

  const endedAt = action === "end" || action === "cancel" || action === "reject"
    ? new Date().toISOString()
    : call.ended_at;

  const { error: updateErr } = await supabase
    .from("mca_calls")
    .update({ status: newStatus, ended_at: endedAt })
    .eq("id", call_id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Write call log for both participants when the call is finished.
  if (newStatus === "completed" || newStatus === "rejected") {
    const duration = Math.max(
      0,
      Math.floor((new Date(endedAt).getTime() - new Date(call.started_at).getTime()) / 1000),
    );
    const logs = [
      {
        call_id,
        user_id: call.caller_id,
        peer_id: call.callee_id,
        direction: "outgoing" as const,
        status: newStatus,
        duration_seconds: duration,
      },
      {
        call_id,
        user_id: call.callee_id,
        peer_id: call.caller_id,
        direction: "incoming" as const,
        status: newStatus,
        duration_seconds: duration,
      },
    ];
    await supabase.from("mca_call_logs").upsert(logs, { onConflict: "call_id,user_id" });

    // Missed-call notification for callee when rejected/cancelled without answer.
    if (newStatus === "rejected" && isCaller) {
      await supabase.from("mca_notifications").insert({
        user_id: call.callee_id,
        type: "missed_call",
        title: "Missed call",
        body: "You missed a call.",
        reference_id: call_id,
      });
    }
  }

  return NextResponse.json({ success: true, status: newStatus });
}