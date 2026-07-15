import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("callrail_connections")
    .select("id, label, created_at")
    .order("label", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ connections: data ?? [] });
}

export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const label = (body.label || "").trim();
  const apiKey = (body.apiKey || "").trim();
  if (!label || !apiKey) {
    return NextResponse.json({ error: "Label and API key are both required." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("callrail_connections")
    .select("id")
    .eq("label", label)
    .maybeSingle();
  const payload = { label, api_key: apiKey, updated_at: new Date().toISOString() };
  if (existing) {
    const { error } = await admin.from("callrail_connections").update(payload).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from("callrail_connections").insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, label });
}
