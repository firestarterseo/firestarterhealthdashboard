import Link from "next/link";
import { createClient } from "../lib/supabase/server";
import { analyzeStatus } from "../lib/metrics";
import AccountsTable from "../components/AccountsTable";
import SignOutButton from "../components/SignOutButton";

export const dynamic = "force-dynamic";

async function getAccountsWithStatus() {
  const supabase = createClient();

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("*")
    .order("name", { ascending: true });

  if (accountsError) throw accountsError;
  if (!accounts?.length) return [];

  const since = new Date();
  since.setDate(since.getDate() - 35);

  const { data: metrics, error: metricsError } = await supabase
    .from("account_metrics_daily")
    .select("*")
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  if (metricsError) throw metricsError;

  const byAccount = {};
  for (const row of metrics ?? []) {
    (byAccount[row.account_id] ??= []).push(row);
  }

  return accounts.map((acc) => {
    const rows = byAccount[acc.id] ?? [];
    const { t7, l7, status, reason } = analyzeStatus(rows);
    return {
      id: acc.id,
      name: acc.name,
      clientSince: acc.client_since,
      sessions7d: t7,
      leads7d: l7,
      status,
      reason,
      recentSessions: rows.slice(-7).map((r) => Number(r.sessions) || 0),
      recentLeads: rows.slice(-7).map((r) => Number(r.total_leads) || 0),
    };
  });
}

export default async function DashboardPage() {
  const accounts = await getAccountsWithStatus();
  const critical = accounts.filter((a) => a.status === "critical").length;
  const warning = accounts.filter((a) => a.status === "warning").length;
  const healthy = accounts.filter((a) => a.status === "healthy").length;

  return (
    <div className="page">
      <div className="brand-bar">
        <img src="/logo.webp" alt="Firestarter SEO" className="brand-logo" />
        <span className="brand-tagline">Account Health Dashboard</span>
        <span className="spacer" />
        <SignOutButton />
      </div>
      <h1>Account Health Dashboard</h1>
      <p className="subtitle">
        High-level view across all client accounts — traffic, search, calls, form submissions, GBP and ads —
        with automatic flags when something goes quiet.
      </p>
      <div className="page-nav">
        <Link href="/admin/connections">Agency Google connections</Link>
      </div>
      <div className="page-actions">
        <Link href="/accounts/new" className="btn-primary inline">
          + Add account
        </Link>
      </div>
      {accounts.length === 0 && (
        <div className="banner">
          No accounts yet. Click <strong>+ Add account</strong> above to add your first one.
        </div>
      )}
      <div className="cards">
        <div className="card">
          <div className="num">{accounts.length}</div>
          <div className="label">Total accounts</div>
        </div>
        <div className="card critical">
          <div className="num">{critical}</div>
          <div className="label">Critical</div>
        </div>
        <div className="card warning">
          <div className="num">{warning}</div>
          <div className="label">Warning</div>
        </div>
        <div className="card healthy">
          <div className="num">{healthy}</div>
          <div className="label">Healthy</div>
        </div>
      </div>
      <AccountsTable accounts={accounts} />
    </div>
  );
}
