// Thin wrappers around the Google APIs used to populate the "pick an existing account"
// dropdowns on the Add Account form. Each function takes a live access token (see
// lib/google/oauth.js -> refreshAccessToken) and returns a plain [{ id, label }] array so the
// UI doesn't need to know anything about each API's response shape.

import { GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID } from "./config";

export async function listGa4Properties(accessToken) {
  const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Failed to list GA4 properties");
  }

  const properties = [];
  for (const account of data.accountSummaries || []) {
    for (const prop of account.propertySummaries || []) {
      properties.push({
        id: prop.property,
        label: `${prop.displayName} — ${account.displayName}`,
      });
    }
  }
  return properties;
}

export async function listSearchConsoleSites(accessToken) {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Failed to list Search Console sites");
  }

  return (data.siteEntry || [])
    .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({ id: s.siteUrl, label: s.siteUrl }));
}

export async function listGbpLocations(accessToken) {
  const acctRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const acctData = await acctRes.json();
  if (!acctRes.ok) {
    throw new Error(
      acctData.error?.message ||
        "Failed to list Business Profile accounts — the Account Management API may not be enabled yet."
    );
  }

  const locations = [];
  for (const account of acctData.accounts || []) {
    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!locRes.ok) continue;
    const locData = await locRes.json();
    for (const loc of locData.locations || []) {
      locations.push({
        id: loc.name,
        label: loc.title || loc.name,
      });
    }
  }
  return locations;
}

// ---------------------------------------------------------------------------
// Daily metric fetchers used by the metrics-sync cron (app/api/cron/sync-metrics).
// Each returns a plain object keyed by ISO date ("YYYY-MM-DD") covering every day
// GA4/GSC/GBP returned data for within [startDate, endDate] (inclusive).
// ---------------------------------------------------------------------------

export async function fetchGa4SessionsRange(accessToken, propertyId, startDate, endDate) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Failed to fetch GA4 sessions");
  }

  const byDate = {};
  for (const row of data.rows || []) {
    const raw = row.dimensionValues?.[0]?.value; // "YYYYMMDD"
    if (!raw || raw.length !== 8) continue;
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    byDate[iso] = Number(row.metricValues?.[0]?.value) || 0;
  }
  return byDate;
}

// Pulls per-day counts broken down by GA4 event name (form_submit, click_to_call,
// file_download, generate_lead, or whatever custom events a given client tracks —
// event tracking setups vary a lot per account, so this deliberately doesn't
// assume any specific event names and just returns whatever exists).
export async function fetchGa4EventsRange(accessToken, propertyId, startDate, endDate) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }, { name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      limit: 100000,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Failed to fetch GA4 events");
  }

  // Returns an array of { date, eventName, count } rather than the byDate-keyed
  // shape the other fetchers use, since each day can have many distinct events.
  const rows = [];
  for (const row of data.rows || []) {
    const raw = row.dimensionValues?.[0]?.value; // "YYYYMMDD"
    const eventName = row.dimensionValues?.[1]?.value;
    if (!raw || raw.length !== 8 || !eventName) continue;
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const count = Number(row.metricValues?.[0]?.value) || 0;
    rows.push({ date: iso, eventName, count });
  }
  return rows;
}

export async function fetchGscMetricsRange(accessToken, siteUrl, startDate, endDate) {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["date"], rowLimit: 1000 }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Failed to fetch Search Console metrics");
  }

  const byDate = {};
  for (const row of data.rows || []) {
    const iso = row.keys?.[0];
    if (!iso) continue;
    byDate[iso] = {
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      position: row.position !== undefined ? Number(row.position) : null,
    };
  }
  return byDate;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// GBP "location" here must be the full resource name (e.g. "locations/123456789") as returned by
// listGbpLocations — the Performance API takes the same resource name used by the Business
// Information API, without an accounts/{id} prefix.
export async function fetchGbpMetricsRange(accessToken, locationName, startDate, endDate) {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);

  const params = new URLSearchParams();
  params.append("dailyMetrics", "CALL_CLICKS");
  params.append("dailyMetrics", "BUSINESS_DIRECTION_REQUESTS");
  params.append("dailyRange.start_date.year", String(sy));
  params.append("dailyRange.start_date.month", String(sm));
  params.append("dailyRange.start_date.day", String(sd));
  params.append("dailyRange.end_date.year", String(ey));
  params.append("dailyRange.end_date.month", String(em));
  params.append("dailyRange.end_date.day", String(ed));

  const res = await fetch(
    `https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.error?.message || "Failed to fetch Business Profile performance metrics"
    );
  }

  const byDate = {};
  for (const series of data.multiDailyMetricTimeSeries || []) {
    for (const metricSeries of series.dailyMetricTimeSeries || []) {
      const metric = metricSeries.dailyMetric;
      for (const dv of metricSeries.timeSeries?.datedValues || []) {
        const { year, month, day } = dv.date || {};
        if (!year) continue;
        const iso = `${year}-${pad2(month)}-${pad2(day)}`;
        byDate[iso] = byDate[iso] || { calls: 0, directionRequests: 0 };
        const value = Number(dv.value) || 0;
        if (metric === "CALL_CLICKS") byDate[iso].calls = value;
        if (metric === "BUSINESS_DIRECTION_REQUESTS") byDate[iso].directionRequests = value;
      }
    }
  }
  return byDate;
}

// Bump when Google sunsets this version (~1 year lifespan per their versioning policy) —
// see https://developers.google.com/google-ads/api/docs/release-notes
const GOOGLE_ADS_API_VERSION = "v23";

function adsCustomerIdDigits(customerId) {
  return (customerId || "").replace(/\D/g, "");
}

// account-level (not campaign-level) daily spend + conversions, via the manager account
// (GOOGLE_ADS_LOGIN_CUSTOMER_ID) acting on behalf of the client's Ads customer ID.
export async function fetchAdsMetricsRange(accessToken, customerId, startDate, endDate) {
  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not set in this deployment's runtime env.");
  }
  const custId = adsCustomerIdDigits(customerId);
  const query = `
    SELECT segments.date, metrics.cost_micros, metrics.conversions
    FROM customer
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;

  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${custId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
        ...(GOOGLE_ADS_LOGIN_CUSTOMER_ID
          ? { "login-customer-id": adsCustomerIdDigits(GOOGLE_ADS_LOGIN_CUSTOMER_ID) }
          : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    const message = Array.isArray(data) ? data[0]?.error?.message : data.error?.message;
    throw new Error(message || "Failed to fetch Google Ads metrics");
  }

  const byDate = {};
  const batches = Array.isArray(data) ? data : [data];
  for (const batch of batches) {
    for (const row of batch.results || []) {
      const iso = row.segments?.date;
      if (!iso) continue;
      byDate[iso] = {
        spend: (Number(row.metrics?.costMicros) || 0) / 1_000_000,
        conversions: Number(row.metrics?.conversions) || 0,
      };
    }
  }
  return byDate;
}
