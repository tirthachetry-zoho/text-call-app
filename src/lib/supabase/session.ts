import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils";

/**
 * Ensure a Supabase auth user exists for the given phone number.
 * If a display name is provided and the user is newly created, it is stored
 * on the profile (the `on_auth_user_created` trigger creates the row).
 * Returns the user id.
 */
export async function ensureUser(
  phoneNumber: string,
  displayName?: string,
): Promise<string> {
  const admin = createAdminClient();
  const normalized = normalizePhone(phoneNumber);

  const { data: existing } = await admin
    .from("mca_users")
    .select("id")
    .eq("phone_number", normalized)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await admin.auth.admin.createUser({
    phone: normalized,
    phone_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });
  if (error || !created.user) {
    throw new Error(error?.message ?? "Failed to create user.");
  }

  if (displayName) {
    await admin
      .from("mca_users")
      .update({ display_name: displayName })
      .eq("id", created.user.id);
  }

  return created.user.id;
}

/**
 * Sign a Supabase-compatible access token (HS256) for the given user.
 * This lets us establish a session after a phone-number registration,
 * without depending on Supabase's own OTP flow.
 */
export function signSupabaseJwt(userId: string, phone: string): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("SUPABASE_JWT_SECRET is not configured.");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    aud: "authenticated",
    role: "authenticated",
    iss: "supabase",
    iat: now,
    exp: now + 60 * 60, // 1 hour
    phone,
    // NOTE: Do NOT include a `session_id` claim. Supabase's GoTrue treats a
    // `session_id` claim as a reference to a real row in `auth.sessions` and
    // returns 403 "session_not_found" when it can't find one. Our sessions are
    // custom-signed (not created via Supabase's auth flow), so omitting the
    // claim lets GoTrue accept the token as a valid user. Verified: a token
    // without `session_id` returns 200 from GET /auth/v1/user.
  };

  const header = { alg: "HS256", typ: "JWT" };
  const enc = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

/**
 * Build a session object the browser client can consume via setSession().
 */
export function buildSession(userId: string, phone: string) {
  const access_token = signSupabaseJwt(userId, phone);
  return {
    access_token,
    // Supabase refresh tokens are opaque; we reuse the access token as a
    // stand-in. The client will re-authenticate on refresh if needed.
    refresh_token: access_token,
    token_type: "bearer",
    expires_in: 3600,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      phone,
    },
  } as const;
}