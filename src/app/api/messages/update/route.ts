import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { editMessageSchema } from "@/lib/validations";

/**
 * PATCH /api/messages/update
 * Body: { message_id, content }
 * Edits a message. Only the original sender may edit their own, non-deleted
 * message. `content` is expected to be already end-to-end encrypted by the
 * client (the server only ever stores ciphertext), so we simply persist it
 * and stamp `edited_at`.
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

  const parsed = editMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { message_id, content } = parsed.data;

  // Verify ownership and that the message isn't already deleted.
  const { data: existing, error: fetchError } = await supabase
    .from("mca_messages")
    .select("id, sender_id, deleted_at")
    .eq("id", message_id)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }
  if (existing.sender_id !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (existing.deleted_at) {
    return NextResponse.json({ error: "Message deleted." }, { status: 410 });
  }

  const { data: updated, error } = await supabase
    .from("mca_messages")
    .update({ content, edited_at: new Date().toISOString() })
    .eq("id", message_id)
    .eq("sender_id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ message: updated });
}