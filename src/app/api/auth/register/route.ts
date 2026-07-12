import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/lib/validations";
import { ensureUser, buildSession } from "@/lib/supabase/session";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * POST /api/auth/register
 * Body: { phone_number: string, display_name: string }
 * Registers (or looks up) a user by phone number + name and returns a
 * Supabase-compatible signed session. No OTP verification is performed.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const { limited, retryAfter } = rateLimit(`register:${ip}`, 5, 60_000);
  if (limited) return rateLimitedResponse(retryAfter);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { phone_number, display_name } = parsed.data;

  try {
    const userId = await ensureUser(phone_number, display_name);
    const session = buildSession(userId, phone_number);

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (err) {
    console.error("register error", err);
    return NextResponse.json(
      { error: "Registration failed. Please try again later." },
      { status: 502 },
    );
  }
}