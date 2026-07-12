// Verify the FIX: a token produced by the app's buildSession() (no session_id
// claim) must return 200 from GET /auth/v1/user. This mirrors the exact
// signing logic in src/lib/supabase/session.ts.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import crypto from "node:crypto";

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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = env.SUPABASE_JWT_SECRET;
const USER_ID = process.argv[2] ?? "9fe13376-35d3-41b7-8991-d9a65eb8f16c";
const PHONE = "919512345678";

// Mirror of signSupabaseJwt (post-fix: no session_id claim)
function signSupabaseJwt(userId, phone) {
  const secret = SECRET;
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: userId, aud: "authenticated", role: "authenticated", iss: "supabase", iat: now, exp: now + 3600, phone };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const headerB64 = enc({ alg: "HS256", typ: "JWT" });
  const payloadB64 = enc(payload);
  const sig = crypto.createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest("base64url");
  return `${headerB64}.${payloadB64}.${sig}`;
}

const token = signSupabaseJwt(USER_ID, PHONE);
const res = await fetch(`${URL}/auth/v1/user`, {
  headers: { apikey: ANON, Authorization: `Bearer ${token}` },
});
const body = await res.text();
console.log("Status:", res.status);
console.log("Body:", body.slice(0, 200));
console.log(res.status === 200 ? "\n✅ FIXED: buildSession token is accepted (no startup 403)" : "\n❌ Still failing");