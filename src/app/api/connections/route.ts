import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/connections
 * Returns the current user's accepted connections with the peer profile.
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
    .from("mca_connections")
    .select(
      `id, created_at, muted, user_a, user_b,
       peer:users!connections_user_b_fkey (id, display_name, avatar, status, phone_number)`,
    )
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Resolve the peer (the side that is not the current user).
  const connections = (data ?? []).map((c: any) => {
    const peerId = c.user_a === user.id ? c.user_b : c.user_a;
    return {
      connection_id: c.id,
      muted: c.muted,
      created_at: c.created_at,
      peer_id: peerId,
    };
  });

  return NextResponse.json({ connections });
}

/**
 * DELETE /api/connections?id=...  — remove a connection.
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
    return NextResponse.json({ error: "Missing connection id." }, { status: 400 });
  }

  const { error } = await supabase
    .from("mca_connections")
    .delete()
    .or(`and(user_a.eq.${user.id},user_b.eq.${id}),and(user_a.eq.${id},user_b.eq.${user.id})`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}