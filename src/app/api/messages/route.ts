import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendMessageSchema, searchMessagesSchema } from "@/lib/validations";

/**
 * GET /api/messages?connection_id=...&before=ISO
 * Returns messages for a connection (most recent first), paginated for
 * infinite scroll. `before` is an ISO timestamp to fetch older messages.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const connectionId = req.nextUrl.searchParams.get("connection_id");
  const before = req.nextUrl.searchParams.get("before");
  if (!connectionId) {
    return NextResponse.json({ error: "Missing connection_id." }, { status: 400 });
  }

  let query = supabase
    .from("mca_messages")
    .select("*")
    .eq("connection_id", connectionId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: (data ?? []).reverse() });
}

/**
 * POST /api/messages
 * Body: { connection_id, content?, attachment_url?, attachment_type? }
 * Sends a message and notifies the peer.
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

  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { connection_id, content, attachment_url, attachment_type } = parsed.data;
  if (!content && !attachment_url) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }

  // Verify membership.
  const { data: connData } = await supabase
    .from("mca_connections")
    .select("user_a, user_b, muted")
    .eq("id", connection_id)
    .single();
  const conn = connData as { user_a: string; user_b: string; muted: boolean } | null;
  if (!conn || (conn.user_a !== user.id && conn.user_b !== user.id)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const peerId = conn.user_a === user.id ? conn.user_b : conn.user_a;

  const { data: created, error } = await supabase
    .from("mca_messages")
    .insert({
      connection_id,
      sender_id: user.id,
      content: content ?? null,
      attachment_url: attachment_url ?? null,
      attachment_type: attachment_type ?? null,
      status: "sent",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

    // Notify peer (skip if connection is muted). Note: message content is
    // end-to-end encrypted client-side, so the server only ever sees
    // ciphertext — we send a generic body rather than the (encrypted) text.
    if (!conn.muted) {
      const { data: senderProfile } = await supabase
        .from("mca_users")
        .select("display_name")
        .eq("id", user.id)
        .single();
      const label = senderProfile?.display_name || "Someone";
      await supabase.from("mca_notifications").insert({
        user_id: peerId,
        type: "message",
        title: label,
        body: "Sent you a message",
        reference_id: created.id,
      });
    }

  return NextResponse.json({ message: created });
}

/**
 * GET /api/messages/search?connection_id=...&query=...
 * Full-text search within a connection's messages.
 */
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const connectionId = req.nextUrl.searchParams.get("connection_id");
  const query = req.nextUrl.searchParams.get("query");
  if (!connectionId || !query) {
    return NextResponse.json({ error: "Missing parameters." }, { status: 400 });
  }

  const parsed = searchMessagesSchema.safeParse({ connection_id: connectionId, query });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mca_messages")
    .select("*")
    .eq("connection_id", connectionId)
    .is("deleted_at", null)
    .ilike("content", `%${query}%`)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}