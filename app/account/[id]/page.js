import { notFound } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { analyzeStatus } from "../../../lib/metrics";
import AccountDetailClient from "../../../components/AccountDetailClient";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }) {
  const supabase = createClient();
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", params.id)
    .single();

  if (accountError || !account) {
    notFound();
  }

  const { data: metricsRows, error: metricsError } = await supabase
    .from("account_metrics_daily")
    .select("*")
    .eq("account_id", params.id)
    .order("date", { ascending: true });

  if (metricsError) throw metricsError;

  const { data: visibilityRows, error: visibilityError } = await supabase
    .from("visibility_keyword_snapshots")
    .select("*")
    .eq("account_id", params.id)
    .order("week_start", { ascending: true });

  if (visibilityError) throw visibilityError;

  const { data: leadRows, error: leadsError } = await supabase
    .from("lead_submissions")
    .select("*")
    .eq("account_id", params.id)
    .eq("is_spam", false)
    .order("submitted_at", { ascending: false })
    .limit(50);

  if (leadsError) throw leadsError;

  const rows = metricsRows ?? [];
  const { status, reason } = analyzeStatus(rows);
  const daysActive = rows.length
    ? Math.round((new Date() - new Date(rows[0].date)) / 86400000) + 1
    : 0;

  return (
    <AccountDetailClient
      account={{ ...account, status, reason, daysActive }}
      metricsRows={rows}
      visibilityRows={visibilityRows ?? []}
      leadRows={leadRows ?? []}
    />
  );
}
