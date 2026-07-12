import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateProfileSchema } from "@/lib/validations";

/**
 * GET /api/profile — current user's profile.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("mca_users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }
  return NextResponse.json({ profile: data });
}

/**
 * PATCH /api/profile — update display_name / avatar.
 */
export async function PATCH(req: NextRequest) {
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
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { error } = await supabase
    .from("mca_users")
    .update({
      ...(parsed.data.display_name !== undefined ? { display_name: parsed.data.display_name } : {}),
      ...(parsed.data.avatar !== undefined ? { avatar: parsed.data.avatar } : {}),
    })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/profile — delete account (user + auth + profile cascade).
 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Delete auth user (profile cascades via FK on delete).
  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}