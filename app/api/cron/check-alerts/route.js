import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { analyzeStatus } from "../../../../lib/metrics";

export async function GET() {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }

  const { data: accounts, error: accountsError } = await supabase.from("accounts").select("id, name");
  if (accountsError) {
    return NextResponse.json({ ok: false, error: accountsError.message }, { status: 500 });
  }

  const since = new Date();
  since.setDate(since.getDate() - 35);

  const { data: metrics, error: metricsError } = await supabase
    .from("account_metrics_daily")
    .select("*")
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  if (metricsError) {
    return NextResponse.json({ ok: false, error: metricsError.message }, { status: 500 });
  }

  const byAccount = {};
  for (const row of metrics ?? []) {
    (byAccount[row.account_id] ??= []).push(row);
  }

  const alertsToInsert = [];
  for (const acc of accounts ?? []) {
    const rows = byAccount[acc.id] ?? [];
    if (!rows.length) continue;
    const { status, reason } = analyzeStatus(rows);
    if (status === "healthy") continue;

    alertsToInsert.push({
      account_id: acc.id,
      severity: status,
      reason: reason || status,
      metric_snapshot: rows.slice(-7),
      notified_channels: [],
    });
  }

  if (alertsToInsert.length) {
    const { error: insertError } = await supabase.from("alerts_log").insert(alertsToInsert);
    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, flagged: alertsToInsert.length });
}
