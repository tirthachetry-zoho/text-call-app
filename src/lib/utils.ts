import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names, resolving conflicts.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalize a phone number to digits only (strips +, spaces, dashes, etc.).
 *
 * Supabase stores `auth.users.phone` WITHOUT the leading '+', and the
 * `on_auth_user_created` trigger copies that value into
 * `mca_users.phone_number`. Normalizing every lookup/comparison to digits
 * only keeps the app consistent with what is actually persisted.
 */
export function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

/**
 * Format a phone number for display (best-effort E.164 masking).
 */
export function formatPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  return `+${digits.slice(0, -4).replace(/\d/g, "•")}${last4}`;
}

/**
 * Mask a phone number so only the last 4 digits are visible, e.g. "•••• 1234".
 * Used wherever a phone number is shown to the user.
 */
export function maskPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

/**
 * Format seconds into mm:ss.
 */
export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Human-friendly relative time.
 */
export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}