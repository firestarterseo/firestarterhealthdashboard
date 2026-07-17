import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

// TEMPORARY diagnostic route — fetches raw form_submissions from CallRail with no
// date filtering, to see actual field names and confirm company_id matching.
// Remove once the forms-not-syncing bug is confirmed and fixed.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json({ error: "missing accountId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (accountError || !account) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }

  const { data: conn, error: connError } = await admin
    .from("callrail_connections")
    .select("api_key")
    .eq("id", account.callrail_connection_id)
    .single();
  if (connError || !conn) {
    return NextResponse.json({ error: "callrail connection not found" }, { status: 404 });
  }

  const url = new URL(
    `https://api.callrail.com/v3/a/${account.callrail_account_id}/form_submissions.json`
  );
  url.searchParams.set("company_id", account.callrail_company_id);
  url.searchParams.set("per_page", "20");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token token="${conn.api_key}"` },
  });
  const data = await res.json();

  return NextResponse.json({
    requestedUrl: url.toString().replace(conn.api_key, "REDACTED"),
    status: res.status,
    ok: res.ok,
    data,
  });
}
