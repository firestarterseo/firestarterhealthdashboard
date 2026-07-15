import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { exchangeCodeForTokens, getGoogleUserEmail } from "../../../../lib/google/oauth";

export async function GET(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const label = (searchParams.get("state") || "").trim();
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(`${origin}/admin/connections?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !label) {
    return NextResponse.redirect(`${origin}/admin/connections?error=missing_code_or_label`);
  }
  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await getGoogleUserEmail(tokens.access_token);
    const grantedScopes = (tokens.scope || "").split(" ").filter(Boolean);
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("agency_connections")
      .select("id")
      .eq("label", label)
      .maybeSingle();
    const payload = {
      label,
      google_email: email,
      granted_scopes: grantedScopes,
      updated_at: new Date().toISOString(),
    };
    if (tokens.refresh_token) {
      payload.refresh_token = tokens.refresh_token;
    }
    if (existing) {
      await admin.from("agency_connections").update(payload).eq("id", existing.id);
    } else {
      await admin.from("agency_connections").insert(payload);
    }
    return NextResponse.redirect(`${origin}/admin/connections?connected=${encodeURIComponent(label)}`);
  } catch (err) {
    return NextResponse.redirect(`${origin}/admin/connections?error=${encodeURIComponent(err.message)}`);
  }
}
