import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { refreshAccessToken } from "../../../../lib/google/oauth";
import { listGa4Properties, listSearchConsoleSites, listGbpLocations } from "../../../../lib/google/apis";

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
    .from("agency_connections")
    .select("id, refresh_token")
    .eq("id", connectionId)
    .maybeSingle();
  if (connectionError || !connection) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }
  if (!connection.refresh_token) {
    return NextResponse.json(
      { error: "This connection has no refresh token saved — reconnect it on the connections page." },
      { status: 400 }
    );
  }
  let accessToken;
  try {
    accessToken = await refreshAccessToken(connection.refresh_token);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  const [ga4, gsc, gbp] = await Promise.all([
    listGa4Properties(accessToken).catch((err) => ({ error: err.message })),
    listSearchConsoleSites(accessToken).catch((err) => ({ error: err.message })),
    listGbpLocations(accessToken).catch((err) => ({ error: err.message })),
  ]);
  return NextResponse.json({
    ga4Properties: Array.isArray(ga4) ? ga4 : [],
    ga4Error: Array.isArray(ga4) ? null : ga4.error,
    gscSites: Array.isArray(gsc) ? gsc : [],
    gscError: Array.isArray(gsc) ? null : gsc.error,
    gbpLocations: Array.isArray(gbp) ? gbp : [],
    gbpError: Array.isArray(gbp) ? null : gbp.error,
  });
}
