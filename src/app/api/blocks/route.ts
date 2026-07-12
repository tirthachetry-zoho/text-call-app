import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { blockUserSchema } from "@/lib/validations";

/**
 * GET /api/blocks — list blocked users.
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
    .from("mca_blocked_users")
    .select("id, blocked_id, created_at")
    .eq("blocker_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ blocked: data ?? [] });
}

/**
 * POST /api/blocks — block a user.
 * Body: { blocked_id }
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
  const parsed = blockUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  if (parsed.data.blocked_id === user.id) {
    return NextResponse.json({ error: "Cannot block yourself." }, { status: 400 });
  }

  const { error } = await supabase
    .from("mca_blocked_users")
    .insert({ blocker_id: user.id, blocked_id: parsed.data.blocked_id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/blocks?id=... — unblock a user.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing blocked_id." }, { status: 400 });
  }
  const { error } = await supabase
    .from("mca_blocked_users")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}