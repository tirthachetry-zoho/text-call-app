// Client-side AES-GCM encryption for message content.
//
// Messages are encrypted in the browser BEFORE they are sent to the API and
// stored in the database, and decrypted after they are read back (including
// via Supabase Realtime). This keeps the stored `content` as ciphertext at
// rest in Postgres.
//
// The symmetric key is derived per-connection from the two participant user
// ids, the connection id, and a salt. Both participants know these values, so
// each can derive the same key and decrypt the conversation. The salt is a
// public constant (it only raises the bar for at-rest reading; it is not a
// substitute for a user-held secret, which this phone-only app does not have).

const SALT = process.env.NEXT_PUBLIC_MESSAGE_SALT || "msg-call-app::v1::salt";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Deterministic, order-independent key material for a connection.
function keyMaterial(connectionId: string, userA: string, userB: string): string {
  const pair = [userA, userB].sort().join("|");
  return `${pair}|${connectionId}|${SALT}`;
}

async function deriveKey(material: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(material));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * Encrypt plaintext for a given connection. Returns "ivB64:ctB64".
 */
export async function encryptMessage(
  plaintext: string,
  connectionId: string,
  userA: string,
  userB: string,
): Promise<string> {
  const key = await deriveKey(keyMaterial(connectionId, userA, userB));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${toBase64(iv)}:${toBase64(new Uint8Array(ct))}`;
}

/**
 * Decrypt a payload produced by encryptMessage. Returns "" on failure so a
 * malformed/legacy row never crashes the UI.
 */
export async function decryptMessage(
  payload: string | null,
  connectionId: string,
  userA: string,
  userB: string,
): Promise<string> {
  if (!payload) return "";
  const idx = payload.indexOf(":");
  if (idx === -1) return payload; // not encrypted (legacy/plaintext)
  try {
    const iv = fromBase64(payload.slice(0, idx));
    const ct = fromBase64(payload.slice(idx + 1));
    const key = await deriveKey(keyMaterial(connectionId, userA, userB));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return "";
  }
}