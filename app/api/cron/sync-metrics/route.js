import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { refreshAccessToken } from "../../../../lib/google/oauth";
import {
  fetchGa4SessionsRange,
  fetchGa4EventsRange,
  fetchGscMetricsRange,
  fetchGbpMetricsRange,
} from "../../../../lib/google/apis";
import { fetchDailyCallMetrics, fetchDailyFormMetrics, fetchFormLeadDetails } from "../../../../lib/callrail/api";

// Unified daily metrics sync: pulls GA4 sessions, Search Console clicks/impressions/position,
// Business Profile calls/direction requests, and CallRail calls/form submissions for every
// configured account, then replaces account_metrics_daily rows for the synced date range.
//
// Runs nightly via vercel.json (small window, catches late-arriving data), and can be triggered
// manually with a larger ?days= window for backfills, e.g. /api/cron/sync-metrics?days=45.
//
// Pass ?accountId=<uuid> to sync just one account instead of all of them — used right after a
// new account is created (see components/NewAccountForm.js) so its first week of data shows up
// immediately instead of waiting for tomorrow's nightly run.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get("days")) || 4, 1), 90);
  const onlyAccountId = searchParams.get("accountId");

  const isoDate = (d) => d.toISOString().slice(0, 10);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const startDate = isoDate(start);
  const endDate = isoDate(end);

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }

  let accountsQuery = admin.from("accounts").select("*");
  if (onlyAccountId) {
    accountsQuery = accountsQuery.eq("id", onlyAccountId);
  }
  const { data: accounts, error: accountsError } = await accountsQuery;
  if (accountsError) {
    return NextResponse.json({ ok: false, error: accountsError.message }, { status: 500 });
  }
  if (onlyAccountId && !accounts?.length) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  const { data: googleConnections, error: gcError } = await admin
    .from("agency_connections")
    .select("id, refresh_token");
  if (gcError) {
    return NextResponse.json({ ok: false, error: gcError.message }, { status: 500 });
  }

  const { data: callrailConnections, error: crError } = await admin
    .from("callrail_connections")
    .select("id, api_key");
  if (crError) {
    return NextResponse.json({ ok: false, error: crError.message }, { status: 500 });
  }

  const googleConnById = Object.fromEntries((googleConnections || []).map((c) => [c.id, c]));
  const callrailConnById = Object.fromEntries((callrailConnections || []).map((c) => [c.id, c]));

  // One access-token refresh per Google connection per run, shared across every account mapped
  // to that agency login, instead of refreshing once per account.
  const accessTokenCache = {};
  async function getAccessToken(connectionId) {
    if (!connectionId) return null;
    if (connectionId in accessTokenCache) return accessTokenCache[connectionId];
    const conn = googleConnById[connectionId];
    if (!conn?.refresh_token) {
      accessTokenCache[connectionId] = null;
      return null;
    }
    try {
      accessTokenCache[connectionId] = await refreshAccessToken(conn.refresh_token);
    } catch {
      accessTokenCache[connectionId] = null;
    }
    return accessTokenCache[connectionId];
  }

  const results = [];

  for (const account of accounts || []) {
    const perDate = {};
    function bucket(date) {
      if (!perDate[date]) {
        perDate[date] = {
          sessions: null,
          gsc_clicks: null,
          gsc_impressions: null,
          gsc_avg_position: null,
          callrail_calls: null,
          callrail_forms: null,
          gbp_calls: null,
          gbp_direction_requests: null,
          _qualifiedCalls: 0,
        };
      }
      return perDate[date];
    }
    // Every day in the sync window gets a row, even if every source comes back empty for it —
    // that's what lets the dashboard tell "0 leads that day" apart from "never synced".
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      bucket(isoDate(d));
    }

    const warnings = [];
    const accessToken = await getAccessToken(account.agency_connection_id);

    if (account.ga4_property_id && !accessToken) {
      warnings.push("GA4: no valid Google connection/refresh token for this account.");
    } else if (account.ga4_property_id) {
      try {
        const sessions = await fetchGa4SessionsRange(accessToken, account.ga4_property_id, startDate, endDate);
        for (const [date, value] of Object.entries(sessions)) {
          bucket(date).sessions = value;
        }
      } catch (err) {
        warnings.push(`GA4: ${err.message}`);
      }

      // GA4 event tracking varies a lot per account — some clients have no
      // CallRail at all and rely entirely on GA4 events (form_submit,
      // click_to_call, etc.) as their lead signal. Stored separately from the
      // core metrics since event names aren't consistent across accounts.
      try {
        const events = await fetchGa4EventsRange(accessToken, account.ga4_property_id, startDate, endDate);
        if (events.length) {
          const { error: eventsError } = await admin
            .from("ga4_events_daily")
            .upsert(
              events.map((e) => ({
                account_id: account.id,
                date: e.date,
                event_name: e.eventName,
                event_count: e.count,
              })),
              { onConflict: "account_id,date,event_name" }
            );
          if (eventsError) {
            warnings.push(`GA4 events storage: ${eventsError.message}`);
          }
        }
      } catch (err) {
        warnings.push(`GA4 events: ${err.message}`);
      }
    }

    if (account.gsc_site_url && accessToken) {
      try {
        const gsc = await fetchGscMetricsRange(accessToken, account.gsc_site_url, startDate, endDate);
        for (const [date, value] of Object.entries(gsc)) {
          const b = bucket(date);
          b.gsc_clicks = value.clicks;
          b.gsc_impressions = value.impressions;
          b.gsc_avg_position = value.position;
        }
      } catch (err) {
        warnings.push(`GSC: ${err.message}`);
      }
    }

    if (account.gbp_location_id && accessToken) {
      try {
        const gbp = await fetchGbpMetricsRange(accessToken, account.gbp_location_id, startDate, endDate);
        for (const [date, value] of Object.entries(gbp)) {
          const b = bucket(date);
          b.gbp_calls = value.calls;
          b.gbp_direction_requests = value.directionRequests;
        }
      } catch (err) {
        warnings.push(`GBP: ${err.message}`);
      }
    }

    const callrailConn = account.callrail_connection_id
      ? callrailConnById[account.callrail_connection_id]
      : null;
    if (callrailConn?.api_key && account.callrail_account_id && account.callrail_company_id) {
      try {
        const [calls, forms, leadDetails] = await Promise.all([
          fetchDailyCallMetrics(
            callrailConn.api_key,
            account.callrail_account_id,
            account.callrail_company_id,
            startDate,
            endDate
          ),
          fetchDailyFormMetrics(
            callrailConn.api_key,
            account.callrail_account_id,
            account.callrail_company_id,
            startDate,
            endDate
          ),
          fetchFormLeadDetails(
            callrailConn.api_key,
            account.callrail_account_id,
            account.callrail_company_id,
            startDate,
            endDate
          ),
        ]);
        for (const [date, value] of Object.entries(calls)) {
          const b = bucket(date);
          b.callrail_calls = value.calls;
          b._qualifiedCalls = value.qualifiedCalls;
        }
        for (const [date, value] of Object.entries(forms)) {
          bucket(date).callrail_forms = value;
        }

        // Store individual lead detail for the "Recent Leads" section — upsert on
        // CallRail's own submission id so re-syncing the same date range doesn't
        // create duplicates.
        if (leadDetails.length) {
          const { error: leadsError } = await admin
            .from("lead_submissions")
            .upsert(
              leadDetails.map((l) => ({ ...l, account_id: account.id })),
              { onConflict: "id" }
            );
          if (leadsError) {
            warnings.push(`Lead detail storage: ${leadsError.message}`);
          }
        }
      } catch (err) {
        warnings.push(`CallRail: ${err.message}`);
      }
    }

    const rows = Object.entries(perDate).map(([date, m]) => {
      const callrailCalls = m.callrail_calls || 0;
      const callrailForms = m.callrail_forms || 0;
      const gbpCalls = m.gbp_calls || 0;
      // Total leads = CallRail calls + CallRail forms + GBP calls (confirmed additive; GBP uses
      // its own click count rather than a shared identifier with CallRail). Qualified leads is a
      // placeholder rule (calls >=30s + all forms) until real scoring rules are defined.
      return {
        account_id: account.id,
        date,
        sessions: m.sessions,
        gsc_clicks: m.gsc_clicks,
        gsc_impressions: m.gsc_impressions,
        gsc_avg_position: m.gsc_avg_position,
        callrail_calls: m.callrail_calls,
        callrail_forms: m.callrail_forms,
        gbp_calls: m.gbp_calls,
        gbp_direction_requests: m.gbp_direction_requests,
        total_leads: callrailCalls + callrailForms + gbpCalls,
        qualified_leads: (m._qualifiedCalls || 0) + callrailForms,
      };
    });

    const { error: deleteError } = await admin
      .from("account_metrics_daily")
      .delete()
      .eq("account_id", account.id)
      .gte("date", startDate)
      .lte("date", endDate);

    if (deleteError) {
      results.push({ account: account.name, ok: false, error: deleteError.message });
      continue;
    }

    const { error: insertError } = await admin.from("account_metrics_daily").insert(rows);
    if (insertError) {
      results.push({ account: account.name, ok: false, error: insertError.message });
      continue;
    }

    results.push({
      account: account.name,
      ok: true,
      daysSynced: rows.length,
      warnings: warnings.length ? warnings : undefined,
    });
  }

  return NextResponse.json({ ok: true, startDate, endDate, results });
}
