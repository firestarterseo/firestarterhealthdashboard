"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Chart from "chart.js/auto";
import {
  METRIC_DEFS,
  METRIC_DB_COLUMN,
  TILE_GROUPS,
  VIS_PLATFORM_DEFS,
  buildCompareRows,
  fmtNum,
  fmtDate,
  aggregateVisibilityWeekly,
  buildVisibilityKeywordRows,
} from "../lib/metrics";

function DeltaBadge({ deltaPct, goodDir }) {
  if (deltaPct === null || deltaPct === undefined) {
    return <span className="delta neutral">New</span>;
  }
  const pct = Math.round(Math.abs(deltaPct) * 100);
  const rising = deltaPct >= 0;
  const arrow = rising ? "▲" : "▼";
  let cls = "neutral";
  if (goodDir !== "neutral") {
    const isGood = goodDir === "up" ? rising : !rising;
    cls = isGood ? "good" : "bad";
  }
  return (
    <span className={`delta ${cls}`}>
      {arrow} {pct}%
    </span>
  );
}

function RankDelta({ curr, prev }) {
  if (curr === null || curr === undefined) return <span className="delta neutral">—</span>;
  const diff = (prev ?? curr) - curr;
  const arrow = diff >= 0 ? "▲" : "▼";
  const cls = diff === 0 ? "neutral" : diff > 0 ? "good" : "bad";
  return (
    <span className={`delta ${cls}`}>
      {arrow} {Math.abs(diff).toFixed(1)}
    </span>
  );
}

function PresenceCell({ curr, prev }) {
  const pill = (
    <span className={`presence-pill ${curr ? "yes" : "no"}`}>{curr ? "Present" : "Not present"}</span>
  );
  if (curr === prev) return pill;
  return (
    <>
      {pill}{" "}
      <span className={`delta ${curr ? "good" : "bad"}`} style={{ marginLeft: 6 }}>
        {curr ? "▲ gained" : "▼ lost"}
      </span>
    </>
  );
}

export default function AccountDetailClient({ account, metricsRows, visibilityRows }) {
  const [tab, setTab] = useState("overview");
  const [selectedMetric, setSelectedMetric] = useState("sessions");
  const [selectedVisMetric, setSelectedVisMetric] = useState("organic");

  const compareRows = useMemo(
    () => buildCompareRows(metricsRows, account.has_ads),
    [metricsRows, account.has_ads]
  );
  const weeklyVis = useMemo(() => aggregateVisibilityWeekly(visibilityRows), [visibilityRows]);
  const keywordRows = useMemo(() => buildVisibilityKeywordRows(visibilityRows), [visibilityRows]);

  const chartRef = useRef(null);
  const chartInstRef = useRef(null);
  const visChartRef = useRef(null);
  const visChartInstRef = useRef(null);

  useEffect(() => {
    if (tab !== "overview" || !chartRef.current) return;
    const col = METRIC_DB_COLUMN[selectedMetric];
    const def = METRIC_DEFS.find((d) => d.key === selectedMetric);
    const labels = metricsRows.map((r) => r.date);
    const data = metricsRows.map((r) => Number(r[col]) || 0);

    if (chartInstRef.current) chartInstRef.current.destroy();
    chartInstRef.current = new Chart(chartRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data,
            borderColor: "#f27f30",
            backgroundColor: "rgba(242,127,48,0.08)",
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            borderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
          y: {
            beginAtZero: def?.key !== "gscAvgPosition",
            reverse: def?.key === "gscAvgPosition",
            ticks: { font: { size: 10 } },
          },
        },
      },
    });

    return () => {
      if (chartInstRef.current) chartInstRef.current.destroy();
    };
  }, [tab, selectedMetric, metricsRows]);

  useEffect(() => {
    if (tab !== "visibility" || !visChartRef.current) return;
    const def = VIS_PLATFORM_DEFS.find((d) => d.key === selectedVisMetric);
    const labels = weeklyVis.map((w) => w.week);
    const data = weeklyVis.map((w) => w[selectedVisMetric]);

    if (visChartInstRef.current) visChartInstRef.current.destroy();
    visChartInstRef.current = new Chart(visChartRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data,
            borderColor: "#7c3aed",
            backgroundColor: "rgba(124,58,237,0.08)",
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            borderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
          y: {
            reverse: def?.type === "rank",
            beginAtZero: def?.type !== "rank",
            ticks: { font: { size: 10 } },
          },
        },
      },
    });

    return () => {
      if (visChartInstRef.current) visChartInstRef.current.destroy();
    };
  }, [tab, selectedVisMetric, weeklyVis]);

  const hasHistory = metricsRows.length > 0;
  const visLen = weeklyVis.length;
  const visPrevIdx = Math.max(0, visLen - 5);

  return (
    <div className="page">
      <Link href="/" className="back-btn">
        ← All accounts
      </Link>

      <div className="detail-head">
        <div>
          <h2>{account.name}</h2>
          <div className="detail-sub">
            Status: <span className={`status-pill ${account.status}`}>{account.status}</span>{" "}
            {account.reason || "no active flags"}
          </div>
          <div className="detail-sub">
            Client since {account.client_since ? fmtDate(account.client_since) : "—"}
            {hasHistory ? ` (${account.daysActive} days)` : ""} — click a metric row below to chart it
          </div>
        </div>
        <Link href={`/account/${account.id}/edit`} className="btn-secondary" style={{ textDecoration: "none" }}>
          Edit account
        </Link>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button
          className={`tab-btn ${tab === "visibility" ? "active" : ""}`}
          onClick={() => setTab("visibility")}
        >
          Visibility
        </button>
      </div>

      {!hasHistory && (
        <div className="banner">
          No metrics recorded for this account yet — the tiles and chart below will populate once
          CallRail/GA4/etc. sync in the first daily snapshot.
        </div>
      )}

      <div style={{ display: tab === "overview" ? "block" : "none" }}>
        <p className="section-label">At a glance — last 30 days vs. previous 30 days</p>
        {TILE_GROUPS.map((g) => {
          const tileRows = g.keys.map((k) => compareRows.find((r) => r.def.key === k)).filter(Boolean);
          if (!tileRows.length) return null;
          return (
            <div className="tile-group" key={g.label}>
              <div className="tile-group-label">{g.label}</div>
              <div className={`tiles-row ${g.hero ? "hero-row" : ""}`}>
                {tileRows.map((r) => (
                  <button
                    key={r.def.key}
                    className={`tile ${g.hero ? "tile-hero" : ""} ${
                      r.def.key === selectedMetric ? "selected" : ""
                    }`}
                    onClick={() => setSelectedMetric(r.def.key)}
                  >
                    <div className="tile-label">{r.def.label}</div>
                    <div className="tile-source">{r.def.source}</div>
                    <div className="tile-value">{fmtNum(r.stats.last30)}</div>
                    <div className="tile-foot">
                      <DeltaBadge deltaPct={r.vsPrev} goodDir={r.def.goodDir} />
                      <span className="tile-sub">vs. prev. 30d</span>
                    </div>
                  </button>
                ))}
              </div>
              {g.note === "reconcile" && (
                <div className="reconcile-note">
                  CallRail Calls + CallRail Forms + GMB Calls feed Total &amp; Qualified Leads above
                  (confirmed additive — GMB uses its own number). Ad Conversions is shown for context
                  only, not included in the totals — it's usually a label on an existing call/form
                  conversion rather than a distinct lead. Qualified Leads applies automated rules
                  (call/GMB duration, form completeness) — placeholder thresholds until the real rules
                  are confirmed.
                </div>
              )}
            </div>
          );
        })}

        <p className="section-label" style={{ marginTop: 36 }}>
          Full breakdown
        </p>
        <div className="soft-card">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Last 30 days</th>
                <th>Prev. 30 days</th>
                <th>vs. prev. period</th>
                <th>First 30 days (baseline)</th>
                <th>vs. baseline (true value)</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((r) => (
                <tr
                  key={r.def.key}
                  className={`chip-row ${r.def.key === selectedMetric ? "selected" : ""}`}
                  onClick={() => setSelectedMetric(r.def.key)}
                >
                  <td>
                    <div className="metric-label">{r.def.label}</div>
                    <div className="metric-source">{r.def.source}</div>
                  </td>
                  <td>{fmtNum(r.stats.last30)}</td>
                  <td>{fmtNum(r.stats.prev30)}</td>
                  <td>
                    <DeltaBadge deltaPct={r.vsPrev} goodDir={r.def.goodDir} />
                  </td>
                  <td>
                    {r.stats.hasBaseline ? (
                      fmtNum(r.stats.first30)
                    ) : (
                      <span className="metric-source">building…</span>
                    )}
                  </td>
                  <td>
                    {r.stats.hasBaseline ? (
                      <DeltaBadge deltaPct={r.vsStart} goodDir={r.def.goodDir} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="baseline-note">
          {account.daysActive < 60
            ? "Baseline comparison unlocks once this account has 60+ days of history."
            : '"vs. baseline" compares the last 30 days to the client\'s first 30 days — the number to use for showing true value delivered.'}
        </div>

        <div className="chart-label">
          {METRIC_DEFS.find((d) => d.key === selectedMetric)?.label} — full history
        </div>
        <div className="soft-card chart-card">
          <div className="chart-wrap" style={{ height: 300 }}>
            <canvas ref={chartRef} />
          </div>
        </div>
      </div>

      <div style={{ display: tab === "visibility" ? "block" : "none" }}>
        <p className="section-label">Visibility — where this brand shows up, latest week vs. ~4 weeks ago</p>
        <div className="tiles-row">
          {VIS_PLATFORM_DEFS.map((d) => {
            const current = visLen ? weeklyVis[visLen - 1][d.key] : null;
            const previous = visLen ? weeklyVis[visPrevIdx][d.key] : null;
            const valueLabel =
              current === null || current === undefined
                ? "—"
                : d.type === "rank"
                ? `#${current.toFixed(1)}`
                : `${Math.round(current)}%`;
            return (
              <button
                key={d.key}
                className={`tile ${d.key === selectedVisMetric ? "selected" : ""}`}
                onClick={() => setSelectedVisMetric(d.key)}
              >
                <div className="tile-label">{d.label}</div>
                <div className="tile-source">{d.source}</div>
                <div className="tile-value">{valueLabel}</div>
                <div className="tile-foot">
                  {d.type === "rank" ? (
                    <RankDelta curr={current} prev={previous} />
                  ) : (
                    <DeltaBadge
                      deltaPct={
                        current === null || previous === null || previous === 0
                          ? null
                          : (current - previous) / 100
                      }
                      goodDir="up"
                    />
                  )}
                  <span className="tile-sub">vs. ~4 weeks ago</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="baseline-note">
          Rank tiles: lower is better. Presence tiles: higher % is better. Click a tile to chart it.
        </div>

        <div className="chart-label">
          {VIS_PLATFORM_DEFS.find((d) => d.key === selectedVisMetric)?.label} — weekly history
        </div>
        <div className="soft-card chart-card">
          <div className="chart-wrap" style={{ height: 220 }}>
            <canvas ref={visChartRef} />
          </div>
        </div>

        <p className="section-label" style={{ marginTop: 36 }}>
          Tracked keywords
        </p>
        <div className="soft-card">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Google Organic</th>
                <th>Google Maps</th>
                <th>AI Overview</th>
                <th>ChatGPT</th>
              </tr>
            </thead>
            <tbody>
              {keywordRows.map((k) => (
                <tr key={k.keyword}>
                  <td className="keyword-cell">{k.keyword}</td>
                  <td>
                    <span className="rank-cell">
                      {k.organicCurrent !== null ? `#${k.organicCurrent}` : "—"}
                    </span>{" "}
                    <RankDelta curr={k.organicCurrent} prev={k.organicPrev} />
                  </td>
                  <td>
                    <span className="rank-cell">{k.mapsCurrent !== null ? `#${k.mapsCurrent}` : "—"}</span>{" "}
                    <RankDelta curr={k.mapsCurrent} prev={k.mapsPrev} />
                  </td>
                  <td>
                    <PresenceCell curr={k.aioCurrent} prev={k.aioPrev} />
                  </td>
                  <td>
                    <PresenceCell curr={k.chatgptCurrent} prev={k.chatgptPrev} />
                  </td>
                </tr>
              ))}
              {keywordRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No visibility data tracked yet for this account.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="baseline-note">
          AI Overview and ChatGPT presence aren't available via a standard API yet — these need a
          rank-tracking tool that covers generative/AI search (e.g. Semrush AI Toolkit, Profound,
          Otterly.ai) rather than a first-party Google feed.
        </div>
      </div>
    </div>
  );
}
