import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { listCompanyOptions } from "../../../../lib/callrail/api";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const connectionId = searchParams.get("connectionId");
  if (!connectionId) {
    return NextResponse.json({ error: "missing connectionId" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("callrail_connections")
    .select("id, api_key")
    .eq("id", connectionId)
    .maybeSingle();
  if (connectionError || !connection) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }
  try {
    const companies = await listCompanyOptions(connection.api_key);
    return NextResponse.json({ companies });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
