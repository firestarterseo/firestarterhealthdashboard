"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtDate } from "../lib/metrics";
const STATUS_ORDER = { critical: 0, warning: 1, healthy: 2 };
function Sparkline({ values, color }) {
  if (!values.length) return null;
  const w = 70;
  const h = 22;
  const max = Math.max(1, ...values);
  const step = w / Math.max(1, values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}
export default function AccountsTable({ accounts }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(() => {
    return accounts
      .filter((a) => (filter === "all" || a.status === filter))
      .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [accounts, search, filter]);
  return (
    <>
      <div className="controls">
        <input
          type="text"
          placeholder="Search accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {["all", "critical", "warning", "healthy"].map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="soft-card">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Status</th>
              <th>Traffic (7d)</th>
              <th>Leads (7d)</th>
              <th>Client since</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const color =
                a.status === "critical" ? "#ef4b45" : a.status === "warning" ? "#f27f30" : "#16a34a";
              return (
                <tr key={a.id} className="clickable">
                  <td>
                    <Link href={`/account/${a.id}`}>
                      {a.name} <span className="chevron">›</span>
                    </Link>
                  </td>
                  <td>
                    <span className={`status-pill ${a.status}`}>{a.status}</span>
                  </td>
                  <td>
                    <Sparkline values={a.recentSessions} color={color} />
                    <div className={`metric-num ${a.sessions7d === 0 ? "zero" : ""}`}>{a.sessions7d}</div>
                    <div className="metric-sub">sessions / 7d</div>
                  </td>
                  <td>
                    <Sparkline values={a.recentLeads} color={color} />
                    <div className={`metric-num ${a.leads7d === 0 ? "zero" : ""}`}>{a.leads7d}</div>
                    <div className="metric-sub">leads (calls+forms+GMB) / 7d</div>
                  </td>
                  <td>
                    <div className="client-since">{a.clientSince ? fmtDate(a.clientSince) : "—"}</div>
                  </td>
                  <td>
                    <div className={`flag-reason ${a.status}`}>{a.reason || "—"}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <div className="empty-state">No accounts match this filter/search.</div>
      )}
      <p className="source-note">
        Thresholds: critical = 0 traffic or 0 leads in the last 7 days, warning = 0 traffic or 0
        leads in the last 3 days. Click a row to open the full account page.
      </p>
    </>
  );
}
