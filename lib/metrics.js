export const METRIC_DEFS = [
  { key: "qualifiedLeads", label: "Qualified Leads", source: "CallRail + GMB, rule-scored", agg: "sum", goodDir: "up" },
  { key: "totalLeads", label: "Total Leads", source: "CallRail calls + forms + GMB calls", agg: "sum", goodDir: "up" },
  { key: "sessions", label: "Sessions", source: "GA4", agg: "sum", goodDir: "up" },
  { key: "callrailCalls", label: "CallRail Calls", source: "CallRail", agg: "sum", goodDir: "up" },
  { key: "callrailForms", label: "CallRail Forms", source: "CallRail", agg: "sum", goodDir: "up" },
  { key: "gscClicks", label: "Search Clicks", source: "Search Console", agg: "sum", goodDir: "up" },
  { key: "gscImpressions", label: "Search Impressions", source: "Search Console", agg: "sum", goodDir: "up" },
  { key: "gscAvgPosition", label: "Avg. Search Position", source: "Search Console", agg: "avg", goodDir: "down" },
  { key: "gbpCalls", label: "GMB Calls", source: "Google Business Profile", agg: "sum", goodDir: "up" },
  { key: "gbpDirectionRequests", label: "GBP Direction Requests", source: "Google Business Profile", agg: "sum", goodDir: "up" },
  { key: "adsSpend", label: "Ad Spend", source: "Google Ads", agg: "sum", goodDir: "neutral", optional: true },
  { key: "adsConversions", label: "Ad Conversions", source: "Google Ads", agg: "sum", goodDir: "up", optional: true },
];

export const TILE_GROUPS = [
  { label: "Lead performance", hero: true, keys: ["qualifiedLeads", "totalLeads"] },
  { label: "Lead sources", note: "reconcile", keys: ["callrailCalls", "callrailForms", "gbpCalls", "adsConversions"] },
  { label: "Traffic & search visibility", keys: ["sessions", "gscClicks", "gscAvgPosition"] },
];

export const VIS_PLATFORM_DEFS = [
  { key: "organic", label: "Google Organic", source: "Search Console rank tracking", type: "rank" },
  { key: "maps", label: "Google Maps / Local Pack", source: "Local rank tracking", type: "rank" },
  { key: "aio", label: "Google AI Overviews", source: "AI search visibility tool", type: "presence" },
  { key: "chatgpt", label: "ChatGPT", source: "AI search visibility tool", type: "presence" },
];

function sumLastN(rows, key, n) {
  const slice = rows.slice(Math.max(0, rows.length - n));
  return slice.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

// Health rules, per spec: critical/warning on zero traffic and zero leads only.
// (Previously also flagged a >60% week-over-week traffic decline as a warning — removed
// since that wasn't part of the agreed spec and was firing unexpectedly.)
export function analyzeStatus(rows) {
  const t7 = sumLastN(rows, "sessions", 7);
  const t3 = sumLastN(rows, "sessions", 3);
  const l7 = sumLastN(rows, "total_leads", 7);
  const l3 = sumLastN(rows, "total_leads", 3);

  let status = "healthy";
  const reasons = [];
  if (t7 === 0) {
    status = "critical";
    reasons.push("Zero traffic for 7+ days");
  } else if (t3 === 0) {
    status = status === "critical" ? status : "warning";
    reasons.push("Zero traffic for 3+ days");
  }
  if (l7 === 0) {
    status = "critical";
    reasons.push("Zero leads for 7+ days");
  } else if (l3 === 0) {
    status = status === "critical" ? status : "warning";
    reasons.push("Zero leads for 3+ days");
  }

  return { t7, l7, status, reason: reasons.join(" · ") };
}

function agg(values, type) {
  if (!values.length) return null;
  if (type === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + b, 0);
}

export const METRIC_DB_COLUMN = {
  sessions: "sessions",
  gscClicks: "gsc_clicks",
  gscImpressions: "gsc_impressions",
  gscAvgPosition: "gsc_avg_position",
  callrailCalls: "callrail_calls",
  callrailForms: "callrail_forms",
  gbpCalls: "gbp_calls",
  gbpDirectionRequests: "gbp_direction_requests",
  adsSpend: "ads_spend",
  adsConversions: "ads_conversions",
  totalLeads: "total_leads",
  qualifiedLeads: "qualified_leads",
};

export function periodStats(rows, defKey, aggType, days = 30) {
  const col = METRIC_DB_COLUMN[defKey];
  const len = rows.length;
  const toNums = (arr) => arr.map((r) => Number(r[col]) || 0);

  const current = agg(toNums(rows.slice(Math.max(0, len - days))), aggType);
  const prev = agg(toNums(rows.slice(Math.max(0, len - days * 2), Math.max(0, len - days))), aggType);
  const hasBaseline = len >= days * 2;
  const first = hasBaseline ? agg(toNums(rows.slice(0, days)), aggType) : null;

  return { current, prev, first, hasBaseline };
}

function shiftIsoDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoDaysBetweenInclusive(start, end) {
  const d1 = new Date(`${start}T00:00:00Z`);
  const d2 = new Date(`${end}T00:00:00Z`);
  return Math.round((d2 - d1) / 86400000) + 1;
}

// Date-range version of periodStats — used by the custom date-range picker, where
// the window isn't just "the last N rows" but an arbitrary start/end the person
// chose. rows are date-string-keyed ('YYYY-MM-DD'), sorted ascending; filtering
// by actual date (rather than trailing array position) also means sync gaps
// don't silently shift the window.
export function periodStatsForRange(rows, defKey, aggType, rangeStart, rangeEnd) {
  const col = METRIC_DB_COLUMN[defKey];
  const toNums = (arr) => arr.map((r) => Number(r[col]) || 0);
  const inRange = (start, end) => rows.filter((r) => r.date >= start && r.date <= end);

  const windowLen = isoDaysBetweenInclusive(rangeStart, rangeEnd);
  const current = agg(toNums(inRange(rangeStart, rangeEnd)), aggType);

  const prevEnd = shiftIsoDate(rangeStart, -1);
  const prevStart = shiftIsoDate(prevEnd, -(windowLen - 1));
  const prev = agg(toNums(inRange(prevStart, prevEnd)), aggType);

  const earliestDate = rows.length ? rows[0].date : rangeStart;
  const latestDate = rows.length ? rows[rows.length - 1].date : rangeEnd;
  const totalSpanDays = rows.length ? isoDaysBetweenInclusive(earliestDate, latestDate) : 0;
  const hasBaseline = totalSpanDays >= windowLen * 2;

  const firstEnd = shiftIsoDate(earliestDate, windowLen - 1);
  const first = hasBaseline ? agg(toNums(inRange(earliestDate, firstEnd)), aggType) : null;

  return { current, prev, first, hasBaseline };
}

export function pctChange(curr, prev) {
  if (prev === null || curr === null) return null;
  if (prev === 0) return curr === 0 ? 0 : null;
  return (curr - prev) / prev;
}

export function buildCompareRows(rows, hasAds, days = 30) {
  return METRIC_DEFS.filter((d) => !d.optional || hasAds).map((def) => {
    const stats = periodStats(rows, def.key, def.agg, days);
    const vsPrev = pctChange(stats.current, stats.prev);
    const vsStart = stats.hasBaseline ? pctChange(stats.current, stats.first) : null;
    return { def, stats, vsPrev, vsStart };
  });
}

export function buildCompareRowsForRange(rows, hasAds, rangeStart, rangeEnd) {
  return METRIC_DEFS.filter((d) => !d.optional || hasAds).map((def) => {
    const stats = periodStatsForRange(rows, def.key, def.agg, rangeStart, rangeEnd);
    const vsPrev = pctChange(stats.current, stats.prev);
    const vsStart = stats.hasBaseline ? pctChange(stats.current, stats.first) : null;
    return { def, stats, vsPrev, vsStart };
  });
}

export function fmtNum(v) {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + "k";
  return String(Math.round(v * 10) / 10);
}

export function fmtDate(d) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function aggregateVisibilityWeekly(visibilityRows) {
  const byWeek = {};
  for (const r of visibilityRows) {
    const wk = r.week_start;
    if (!byWeek[wk]) {
      byWeek[wk] = { organic: [], maps: [], aioCount: 0, aioTotal: 0, chatgptCount: 0, chatgptTotal: 0 };
    }
    const bucket = byWeek[wk];
    if (r.google_organic_rank !== null && r.google_organic_rank !== undefined) {
      bucket.organic.push(Number(r.google_organic_rank));
    }
    if (r.google_maps_rank !== null && r.google_maps_rank !== undefined) {
      bucket.maps.push(Number(r.google_maps_rank));
    }
    bucket.aioTotal += 1;
    if (r.ai_overview_present) bucket.aioCount += 1;
    bucket.chatgptTotal += 1;
    if (r.chatgpt_present) bucket.chatgptCount += 1;
  }
  const weeks = Object.keys(byWeek).sort();
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  return weeks.map((wk) => {
    const b = byWeek[wk];
    return {
      week: wk,
      organic: avg(b.organic),
      maps: avg(b.maps),
      aio: b.aioTotal ? (b.aioCount / b.aioTotal) * 100 : null,
      chatgpt: b.chatgptTotal ? (b.chatgptCount / b.chatgptTotal) * 100 : null,
    };
  });
}

export function buildVisibilityKeywordRows(visibilityRows) {
  const byKeyword = {};
  for (const r of visibilityRows) {
    (byKeyword[r.keyword] ??= []).push(r);
  }
  return Object.entries(byKeyword).map(([keyword, rows]) => {
    const sorted = [...rows].sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)));
    const current = sorted[sorted.length - 1];
    const prevIdx = Math.max(0, sorted.length - 5);
    const previous = sorted[prevIdx];
    return {
      keyword,
      organicCurrent: current?.google_organic_rank ?? null,
      organicPrev: previous?.google_organic_rank ?? null,
      mapsCurrent: current?.google_maps_rank ?? null,
      mapsPrev: previous?.google_maps_rank ?? null,
      aioCurrent: current?.ai_overview_present ?? null,
      aioPrev: previous?.ai_overview_present ?? null,
      chatgptCurrent: current?.chatgpt_present ?? null,
      chatgptPrev: previous?.chatgpt_present ?? null,
    };
  });
}
