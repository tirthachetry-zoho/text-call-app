import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondRequestSchema } from "@/lib/validations";

/**
 * POST /api/connections/respond
 * Body: { request_id: string, action: "accept" | "reject" }
 * The receiver accepts or rejects a pending connection request.
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

  const parsed = respondRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { request_id, action } = parsed.data;

  // Fetch the request; only the receiver may respond.
  const { data: request, error: reqErr } = await supabase
    .from("mca_connection_requests")
    .select("id, sender_id, receiver_id, status")
    .eq("id", request_id)
    .single();

  if (reqErr || !request) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (request.receiver_id !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "Request already handled." }, { status: 409 });
  }

  const newStatus = action === "accept" ? "accepted" : "rejected";
  const { error: updateErr } = await supabase
    .from("mca_connection_requests")
    .update({ status: newStatus })
    .eq("id", request_id);

  if (updateErr) {
    return NextResponse.json({ error: "Could not update request." }, { status: 500 });
  }

  // The accept/reject triggers handle connection creation + notifications.
  return NextResponse.json({ success: true, status: newStatus });
}