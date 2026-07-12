// Standalone script to create (or look up) a user in the REAL Supabase
// project using the credentials from the local .env.local file.
//
// Usage: node scripts/create-user.mjs <phone_number> <display_name>
//   phone_number : e.g. +919500000001
//   display_name : e.g. "Test User"
//
// If the user already exists (by phone number) it is returned instead of
// being re-created.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// --- Load env vars from .env.local -------------------------------------------
const envPath = resolve(root, ".env.local");
const envRaw = readFileSync(envPath, "utf8");
const env = {};
for (const line of envRaw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  let val = trimmed.slice(idx + 1).trim();
  // strip surrounding quotes if present
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const phone = process.argv[2];
const displayName = process.argv[3] ?? "Test User";

if (!phone) {
  console.error("Usage: node scripts/create-user.mjs <phone_number> <display_name>");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const normalizePhone = (p) => (p ?? "").replace(/\D/g, "");

async function ensureUser(phoneNumber, displayName) {
  const normalized = normalizePhone(phoneNumber);

  // 1. Look for an existing profile by phone number (digits only, matching
  //    how Supabase persists auth.users.phone without the leading '+').
  const { data: existing } = await admin
    .from("mca_users")
    .select("id, phone_number, display_name")
    .eq("phone_number", normalized)
    .maybeSingle();

  if (existing) {
    console.log("User already exists:", existing);
    return existing.id;
  }

  // 2. Create a new auth user (phone confirmed) + profile via trigger.
  const { data: created, error } = await admin.auth.admin.createUser({
    phone: normalized,
    phone_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });
  if (error || !created.user) {
    throw new Error(error?.message ?? "Failed to create user.");
  }

  if (displayName) {
    const { error: updErr } = await admin
      .from("mca_users")
      .update({ display_name: displayName })
      .eq("id", created.user.id);
    if (updErr) console.warn("Profile name update warning:", updErr.message);
  }

  console.log("Created new user:", {
    id: created.user.id,
    phone: created.user.phone,
  });
  return created.user.id;
}

try {
  const userId = await ensureUser(phone, displayName);

  // 3. Verify the profile row exists in the real DB.
  const { data: profile, error } = await admin
    .from("mca_users")
    .select("id, phone_number, display_name, status, created_at")
    .eq("id", userId)
    .single();

  if (error) throw new Error(error.message);

  console.log("\n✅ Verified profile in real environment:");
  console.log(JSON.stringify(profile, null, 2));
} catch (err) {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
}