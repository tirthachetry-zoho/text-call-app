import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/lib/validations";
import { ensureUser, buildSession } from "@/lib/supabase/session";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * Guard: the register flow needs the Supabase service-role client and the
 * JWT secret. On Vercel these must be set in the project's Environment
 * Variables — `.env.local` is gitignored and is NOT deployed. If they are
 * missing we fail fast with a clear message instead of a generic 502.
 */
function missingConfig(): string | null {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.SUPABASE_JWT_SECRET) missing.push("SUPABASE_JWT_SECRET");
  return missing.length ? missing.join(", ") : null;
}

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

  const missing = missingConfig();
  if (missing) {
    console.error("register error: missing environment variables:", missing);
    return NextResponse.json(
      { error: "Server configuration error. Missing: " + missing },
      { status: 500 },
    );
  }

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