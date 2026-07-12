import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteMessageSchema } from "@/lib/validations";

/**
 * DELETE /api/messages/delete
 * Body: { message_id }
 * Soft-deletes a message (only the sender may delete their own).
 */
export async function DELETE(req: NextRequest) {
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

  const parsed = deleteMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { error } = await supabase
    .from("mca_messages")
    .update({ deleted_at: new Date().toISOString(), content: null, attachment_url: null })
    .eq("id", parsed.data.message_id)
    .eq("sender_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}