// Thin wrapper around the CallRail v3 API. CallRail auth is a static per-user API key
// (not OAuth) — see https://apidocs.callrail.com/ — so there's no token refresh step here,
// unlike lib/google/oauth.js.

function authHeaders(apiKey) {
  return { Authorization: `Token token="${apiKey}"` };
}

// CallRail's v3 list endpoints are paginated (default page size is much smaller than most
// agencies' full account/company count). Fetching only page 1 silently truncates the list —
// which client(s) get cut off depends on CallRail's default sort, not on active/inactive status.
// This walks every page and concatenates results.
async function fetchAllPages(url, apiKey, key, extraParams = {}) {
  const items = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("page", String(page));
    pageUrl.searchParams.set("per_page", "250");
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== null && v !== "") pageUrl.searchParams.set(k, v);
    }

    const res = await fetch(pageUrl.toString(), { headers: authHeaders(apiKey) });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || `Failed to list CallRail ${key}`);
    }

    const pageItems = data[key] || [];
    items.push(...pageItems);

    const totalPages = data.total_pages || 1;
    if (page >= totalPages || pageItems.length === 0) break;
    page += 1;
  }
  return items;
}

export async function listAccounts(apiKey) {
  return fetchAllPages("https://api.callrail.com/v3/a.json", apiKey, "accounts");
}

export async function listCompanies(apiKey, accountId) {
  return fetchAllPages(`https://api.callrail.com/v3/a/${accountId}/companies.json`, apiKey, "companies");
}

// Returns [{ id: "<accountId>::<companyId>", label: "Company — Account" }] so the Add Account
// form can offer one dropdown that fills in both callrail_account_id and callrail_company_id.
export async function listCompanyOptions(apiKey) {
  const accounts = await listAccounts(apiKey);
  const options = [];
  for (const account of accounts) {
    let companies = [];
    try {
      companies = await listCompanies(apiKey, account.id);
    } catch {
      continue; // skip accounts we can't read rather than failing the whole list
    }
    for (const company of companies) {
      options.push({
        id: `${account.id}::${company.id}`,
        label: `${company.name} — ${account.name}`,
      });
    }
  }
  return options;
}

// Diagnostic variant: also surfaces which accounts failed the companies call and why, since
// listCompanyOptions silently skips accounts it can't read (e.g. a permissions gap on one
// account within an otherwise-working API key).
export async function listCompanyOptionsDebug(apiKey) {
  const accounts = await listAccounts(apiKey);
  const options = [];
  const accountErrors = [];
  for (const account of accounts) {
    let companies = [];
    try {
      companies = await listCompanies(apiKey, account.id);
    } catch (err) {
      accountErrors.push({ accountId: account.id, accountName: account.name, error: err.message });
      continue;
    }
    for (const company of companies) {
      options.push({
        id: `${account.id}::${company.id}`,
        label: `${company.name} — ${account.name}`,
      });
    }
  }
  return { options, accounts, accountErrors };
}

// ---------------------------------------------------------------------------
// Daily metric fetchers used by the metrics-sync cron (app/api/cron/sync-metrics).
// Both return a plain object keyed by ISO date ("YYYY-MM-DD"), bucketing every call/form
// found in [startDate, endDate] (inclusive) by the date portion of its own timestamp.
// ---------------------------------------------------------------------------

// Calls also carry a naive "qualified" signal (duration >= 30s) since there's no confirmed
// qualification rule yet — this is a placeholder until the real scoring rules are defined.
export async function fetchDailyCallMetrics(apiKey, accountId, companyId, startDate, endDate) {
  const calls = await fetchAllPages(
    `https://api.callrail.com/v3/a/${accountId}/calls.json`,
    apiKey,
    "calls",
    { company_id: companyId, start_date: startDate, end_date: endDate }
  );

  const byDate = {};
  for (const call of calls) {
    const raw = call.start_time;
    if (!raw) continue;
    const iso = raw.slice(0, 10);
    if (!byDate[iso]) byDate[iso] = { calls: 0, qualifiedCalls: 0 };
    byDate[iso].calls += 1;
    if ((Number(call.duration) || 0) >= 30) byDate[iso].qualifiedCalls += 1;
  }
  return byDate;
}

export async function fetchDailyFormMetrics(apiKey, accountId, companyId, startDate, endDate) {
  const forms = await fetchAllPages(
    `https://api.callrail.com/v3/a/${accountId}/form_submissions.json`,
    apiKey,
    "form_submissions",
    { company_id: companyId, start_date: startDate, end_date: endDate }
  );

  const byDate = {};
  for (const form of forms) {
    const raw = form.submitted_at;
    if (!raw) continue;
    const iso = raw.slice(0, 10);
    byDate[iso] = (byDate[iso] || 0) + 1;
  }
  return byDate;
}
