import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/messages/receipt
 * Body: { message_id, status: "delivered" | "read" }
 * Updates the delivery/read receipt for a message (only the recipient may).
 */
export async function PATCH(req: NextRequest) {
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

  const { message_id, status } = body as { message_id?: string; status?: string };
  if (!message_id || !["delivered", "read"].includes(status ?? "")) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  // Only the recipient (non-sender) may update receipts.
  const { data: msg } = await supabase
    .from("mca_messages")
    .select("sender_id, connection_id")
    .eq("id", message_id)
    .single();
  if (!msg || msg.sender_id === user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { error } = await supabase
    .from("mca_messages")
    .update({ status })
    .eq("id", message_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}