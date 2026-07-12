import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendConnectionRequestSchema } from "@/lib/validations";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/utils";

/**
 * POST /api/connections/request
 * Body: { phone_number: string }
 * Sends a connection request to the user with the given phone number.
 * Enforces: recipient must exist, not already connected/requested, not blocked,
 * and not within a rejection cooldown.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const { limited, retryAfter } = rateLimit(`conn-req:${ip}`, 10, 60_000);
  if (limited) return rateLimitedResponse(retryAfter);

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

  const parsed = sendConnectionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
  }

  const targetPhone = normalizePhone(parsed.data.phone_number);

  // Resolve recipient by phone number.
  const { data: recipient, error: recipientErr } = await supabase
    .from("mca_users")
    .select("id, phone_number")
    .eq("phone_number", targetPhone)
    .maybeSingle();

  if (recipientErr) {
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
  if (!recipient) {
    return NextResponse.json(
      { error: "This phone number is not registered." },
      { status: 404 },
    );
  }
  if (recipient.id === user.id) {
    return NextResponse.json({ error: "You cannot connect with yourself." }, { status: 400 });
  }

  // Block check (either direction).
  const { data: blocked } = await supabase
    .from("mca_blocked_users")
    .select("id")
    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${recipient.id}),and(blocker_id.eq.${recipient.id},blocked_id.eq.${user.id})`)
    .maybeSingle();
  if (blocked) {
    return NextResponse.json({ error: "Unable to send request." }, { status: 403 });
  }

  // Already connected?
  const { data: conn } = await supabase
    .from("mca_connections")
    .select("id")
    .or(`and(user_a.eq.${user.id},user_b.eq.${recipient.id}),and(user_a.eq.${recipient.id},user_b.eq.${user.id})`)
    .maybeSingle();
  if (conn) {
    return NextResponse.json({ error: "Already connected." }, { status: 409 });
  }

  // Existing request (either direction)?
  const { data: existingReq } = await supabase
    .from("mca_connection_requests")
    .select("id, status")
    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${recipient.id}),and(sender_id.eq.${recipient.id},receiver_id.eq.${user.id})`)
    .maybeSingle();
  if (existingReq) {
    if (existingReq.status === "pending") {
      return NextResponse.json({ error: "Request already pending." }, { status: 409 });
    }
    if (existingReq.status === "accepted") {
      return NextResponse.json({ error: "Already connected." }, { status: 409 });
    }
  }

  // Rejection cooldown?
  const { data: cooldown } = await supabase
    .from("mca_rejection_cooldowns")
    .select("expires_at")
    .eq("requester_id", user.id)
    .eq("rejecter_id", recipient.id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cooldown) {
    const remaining = Math.ceil(
      (new Date(cooldown.expires_at).getTime() - Date.now()) / 3_600_000,
    );
    return NextResponse.json(
      { error: `You cannot request again for ${remaining} hour(s).` },
      { status: 403 },
    );
  }

  // Create the request.
  const { data: created, error: insertErr } = await supabase
    .from("mca_connection_requests")
    .insert({
      sender_id: user.id,
      receiver_id: recipient.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: "Could not send request." }, { status: 500 });
  }

  // Notify recipient.
  const { data: senderProfile } = await supabase
    .from("mca_users")
    .select("display_name, phone_number")
    .eq("id", user.id)
    .single();

  const label = senderProfile?.display_name || senderProfile?.phone_number || "Someone";
  await supabase.from("mca_notifications").insert({
    user_id: recipient.id,
    type: "connection_request",
    title: "New connection request",
    body: `${label} wants to connect with you.`,
    reference_id: created.id,
  });

  return NextResponse.json({ success: true, request_id: created.id });
}