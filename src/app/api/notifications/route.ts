import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/notifications — current user's notifications.
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
    .from("mca_notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notifications: data ?? [] });
}

/**
 * PATCH /api/notifications — mark one or all as read.
 * Body: { id?: string }  (omit id to mark all read)
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body — mark all read
  }

  let query = supabase.from("mca_notifications").update({ read: true }).eq("user_id", user.id);
  if (body.id) query = query.eq("id", body.id);
  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}