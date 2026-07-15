import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { buildAuthUrl } from "../../../../lib/google/oauth";

export async function GET(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const { searchParams } = new URL(request.url);
  const label = (searchParams.get("label") || "").trim();
  if (!label) {
    return NextResponse.redirect(new URL("/admin/connections?error=missing_label", request.url));
  }
  return NextResponse.redirect(buildAuthUrl(label));
}
