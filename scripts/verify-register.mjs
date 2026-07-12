// Reproduce the /api/auth/register flow against the REAL project using the
// exact same logic as src/lib/supabase/session.ts ensureUser + buildSession.
// This tells us whether the failure is env/secret related or something else.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const envRaw = readFileSync(resolve(root, ".env.local"), "utf8");
const env = {};
for (const line of envRaw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = env.SUPABASE_JWT_SECRET;

console.log("URL set:", !!URL, "| SERVICE_ROLE set:", !!SERVICE, "| JWT_SECRET set:", !!SECRET);

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const phone = "919587654321";
const name = "Vercel Test";

// 1. lookup
const { data: existing } = await admin.from("mca_users").select("id").eq("phone_number", phone).maybeSingle();
console.log("lookup existing:", existing ?? "none");

// 2. create
const { data: created, error } = await admin.auth.admin.createUser({
  phone,
  phone_confirm: true,
  user_metadata: { display_name: name },
});
console.log("createUser error:", error ?? "none");
if (created?.user) console.log("created user id:", created.user.id);

// 3. sign session (mirror of buildSession, no session_id)
function signSupabaseJwt(userId, ph) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: userId, aud: "authenticated", role: "authenticated", iss: "supabase", iat: now, exp: now + 3600, phone: ph };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = enc({ alg: "HS256", typ: "JWT" });
  const p = enc(payload);
  const sig = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}
if (created?.user) {
  const token = signSupabaseJwt(created.user.id, phone);
  const res = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  console.log("session check status:", res.status);
}
console.log("\nIf all steps above succeeded, the register logic works with these creds.");