"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

const BLANK = {
  name: "",
  client_since: new Date().toISOString().slice(0, 10),
  agency_connection_id: "",
  ga4_property_id: "",
  gsc_site_url: "",
  callrail_connection_id: "",
  callrail_account_id: "",
  callrail_company_id: "",
  gbp_location_id: "",
  ads_customer_id: "",
  has_ads: false,
};

const EMPTY_GOOGLE_OPTIONS = {
  ga4Properties: [],
  ga4Error: null,
  gscSites: [],
  gscError: null,
  gbpLocations: [],
  gbpError: null,
};

const EMPTY_CALLRAIL_OPTIONS = { companies: [], error: null };

function SearchableSelect({ value, onChange, options, placeholder, emptyLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    setQuery(selected ? selected.label : "");
  }, [value, selected]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery(selected ? selected.label : "");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selected]);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed ? options.filter((o) => o.label.toLowerCase().includes(trimmed)) : options;

  function pick(id, label) {
    onChange(id);
    setQuery(label);
    setOpen(false);
  }

  return (
    <div className="searchable-select" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "Search…"}
      />
      {open && (
        <div className="searchable-select-menu">
          <div className="searchable-select-option placeholder" onClick={() => pick("", "")}>
            {emptyLabel || "— Select —"}
          </div>
          {filtered.map((opt) => (
            <div key={opt.id} className="searchable-select-option" onClick={() => pick(opt.id, opt.label)}>
              {opt.label}
            </div>
          ))}
          {filtered.length === 0 && <div className="searchable-select-empty">No matches for "{query}"</div>}
        </div>
      )}
    </div>
  );
}

function PickOrTypeField({ label, value, onChange, options, error, manual, onManualToggle, placeholder }) {
  const hasOptions = options.length > 0;

  return (
    <div className="form-field form-field-wide">
      <label>{label}</label>
      {hasOptions && !manual ? (
        <SearchableSelect value={value} onChange={onChange} options={options} placeholder="Search or select…" />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}

      {hasOptions && (
        <button type="button" className="link-toggle" onClick={() => onManualToggle(!manual)}>
          {manual ? "Choose from list instead" : "Enter ID manually instead"}
        </button>
      )}
      {error && <span className="form-hint">{error}</span>}
    </div>
  );
}

export default function NewAccountForm({ initialAccount } = {}) {
  const router = useRouter();
  const isEdit = Boolean(initialAccount);

  const [form, setForm] = useState(() =>
    isEdit
      ? {
          name: initialAccount.name || "",
          client_since: initialAccount.client_since || new Date().toISOString().slice(0, 10),
          agency_connection_id: initialAccount.agency_connection_id || "",
          ga4_property_id: initialAccount.ga4_property_id || "",
          gsc_site_url: initialAccount.gsc_site_url || "",
          callrail_connection_id: initialAccount.callrail_connection_id || "",
          callrail_account_id: initialAccount.callrail_account_id || "",
          callrail_company_id: initialAccount.callrail_company_id || "",
          gbp_location_id: initialAccount.gbp_location_id || "",
          ads_customer_id: initialAccount.ads_customer_id || "",
          has_ads: Boolean(initialAccount.has_ads),
        }
      : BLANK
  );
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [connections, setConnections] = useState([]);
  const [callrailConnections, setCallrailConnections] = useState([]);

  const [googleOptions, setGoogleOptions] = useState(EMPTY_GOOGLE_OPTIONS);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [manualGa4, setManualGa4] = useState(isEdit && Boolean(initialAccount?.ga4_property_id));
  const [manualGsc, setManualGsc] = useState(isEdit && Boolean(initialAccount?.gsc_site_url));
  const [manualGbp, setManualGbp] = useState(isEdit && Boolean(initialAccount?.gbp_location_id));

  const [callrailOptions, setCallrailOptions] = useState(EMPTY_CALLRAIL_OPTIONS);
  const [callrailOptionsLoading, setCallrailOptionsLoading] = useState(false);
  const [manualCallrail, setManualCallrail] = useState(
    isEdit && Boolean(initialAccount?.callrail_account_id)
  );

  useEffect(() => {
    fetch("/api/connections")
      .then((res) => res.json())
      .then((data) => setConnections(data.connections || []))
      .catch(() => setConnections([]));

    fetch("/api/callrail/connections")
      .then((res) => res.json())
      .then((data) => setCallrailConnections(data.connections || []))
      .catch(() => setCallrailConnections([]));
  }, []);

  useEffect(() => {
    if (!form.agency_connection_id) {
      setGoogleOptions(EMPTY_GOOGLE_OPTIONS);
      return;
    }
    setOptionsLoading(true);
    fetch(`/api/google/options?connectionId=${encodeURIComponent(form.agency_connection_id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setGoogleOptions({
            ...EMPTY_GOOGLE_OPTIONS,
            ga4Error: data.error,
            gscError: data.error,
            gbpError: data.error,
          });
        } else {
          setGoogleOptions(data);
        }
      })
      .catch(() => setGoogleOptions(EMPTY_GOOGLE_OPTIONS))
      .finally(() => setOptionsLoading(false));
  }, [form.agency_connection_id]);

  useEffect(() => {
    if (!form.callrail_connection_id) {
      setCallrailOptions(EMPTY_CALLRAIL_OPTIONS);
      return;
    }
    setCallrailOptionsLoading(true);
    fetch(`/api/callrail/options?connectionId=${encodeURIComponent(form.callrail_connection_id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setCallrailOptions({ companies: [], error: data.error });
        } else {
          setCallrailOptions({ companies: data.companies || [], error: null });
        }
      })
      .catch(() => setCallrailOptions(EMPTY_CALLRAIL_OPTIONS))
      .finally(() => setCallrailOptionsLoading(false));
  }, [form.callrail_connection_id]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const combinedCallrailValue =
    form.callrail_account_id && form.callrail_company_id
      ? `${form.callrail_account_id}::${form.callrail_company_id}`
      : "";

  const connectionOptions = connections.map((c) => ({
    id: c.id,
    label: c.label + (c.google_email ? ` (${c.google_email})` : ""),
  }));

  const callrailConnectionOptions = callrailConnections.map((c) => ({ id: c.id, label: c.label }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Account name is required.");
      return;
    }
    setStatus("saving");
    setError("");

    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      client_since: form.client_since || new Date().toISOString().slice(0, 10),
      agency_connection_id: form.agency_connection_id || null,
      ga4_property_id: form.ga4_property_id.trim() || null,
      gsc_site_url: form.gsc_site_url.trim() || null,
      callrail_connection_id: form.callrail_connection_id || null,
      callrail_account_id: form.callrail_account_id.trim() || null,
      callrail_company_id: form.callrail_company_id.trim() || null,
      gbp_location_id: form.gbp_location_id.trim() || null,
      ads_customer_id: form.ads_customer_id.trim() || null,
      has_ads: form.has_ads,
    };

    if (isEdit) {
      const { error: updateError } = await supabase
        .from("accounts")
        .update(payload)
        .eq("id", initialAccount.id);

      if (updateError) {
        setStatus("error");
        setError(updateError.message);
        return;
      }

      router.push(`/account/${initialAccount.id}`);
      router.refresh();
      return;
    }

    const { data, error: insertError } = await supabase
      .from("accounts")
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      setStatus("error");
      setError(insertError.message);
      return;
    }

    // Pull this account's first week of data right away rather than waiting for tomorrow's
    // nightly sync — fire-and-forget so a slow GA4/GSC/CallRail response doesn't block the
    // redirect; the account page will just show empty tiles until it lands a moment later.
    // 90 days rather than just a first week — enough to clear the 60-day baseline
    // threshold immediately, since the underlying GA4/GSC/CallRail data already
    // exists this far back regardless of when the account was added here.
    fetch(`/api/cron/sync-metrics?accountId=${data.id}&days=90`).catch(() => {});

    router.push(`/account/${data.id}`);
    router.refresh();
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-field form-field-wide">
          <label>Account name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Acme Plumbing"
            required
          />
        </div>

        <div className="form-field form-field-wide">
          <label>Client since</label>
          <input
            type="date"
            value={form.client_since}
            onChange={(e) => update("client_since", e.target.value)}
          />
        </div>

        <div className="form-field form-field-wide">
          <label>Agency Google login (for GA4 / Search Console / GBP)</label>
          <SearchableSelect
            value={form.agency_connection_id}
            onChange={(v) => update("agency_connection_id", v)}
            options={connectionOptions}
            placeholder="Search connected Google logins…"
            emptyLabel="— None connected yet —"
          />
          {connections.length === 0 && (
            <span className="form-hint">
              No agency Google logins connected yet — set one up on the{" "}
              <a href="/admin/connections" style={{ color: "var(--orange)", textDecoration: "underline" }}>
                connections page
              </a>
              , then come back here.
            </span>
          )}
          {form.agency_connection_id && optionsLoading && (
            <span className="form-hint">Loading available GA4 properties, Search Console sites, and GBP locations…</span>
          )}
        </div>

        <PickOrTypeField
          label="GA4 property"
          value={form.ga4_property_id}
          onChange={(v) => update("ga4_property_id", v)}
          options={googleOptions.ga4Properties}
          error={googleOptions.ga4Error}
          manual={manualGa4}
          onManualToggle={setManualGa4}
          placeholder="properties/123456789"
        />

        <PickOrTypeField
          label="Search Console site"
          value={form.gsc_site_url}
          onChange={(v) => update("gsc_site_url", v)}
          options={googleOptions.gscSites}
          error={googleOptions.gscError}
          manual={manualGsc}
          onManualToggle={setManualGsc}
          placeholder="https://example.com/"
        />

        <div className="form-field form-field-wide">
          <label>Agency CallRail login</label>
          <SearchableSelect
            value={form.callrail_connection_id}
            onChange={(v) => update("callrail_connection_id", v)}
            options={callrailConnectionOptions}
            placeholder="Search connected CallRail logins…"
            emptyLabel="— None connected yet —"
          />
          {callrailConnections.length === 0 && (
            <span className="form-hint">
              No CallRail logins connected yet — set one up on the{" "}
              <a href="/admin/connections" style={{ color: "var(--orange)", textDecoration: "underline" }}>
                connections page
              </a>
              , then come back here.
            </span>
          )}
          {form.callrail_connection_id && callrailOptionsLoading && (
            <span className="form-hint">Loading CallRail companies…</span>
          )}
        </div>

        <div className="form-field form-field-wide">
          <label>CallRail company</label>
          {callrailOptions.companies.length > 0 && !manualCallrail ? (
            <SearchableSelect
              value={combinedCallrailValue}
              onChange={(v) => {
                const [acctId, compId] = v.split("::");
                update("callrail_account_id", acctId || "");
                update("callrail_company_id", compId || "");
              }}
              options={callrailOptions.companies}
              placeholder="Search CallRail companies…"
            />
          ) : manualCallrail || (form.callrail_connection_id && !callrailOptionsLoading) ? (
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
              <input
                type="text"
                placeholder="CallRail account ID"
                value={form.callrail_account_id}
                onChange={(e) => update("callrail_account_id", e.target.value)}
              />
              <input
                type="text"
                placeholder="CallRail company ID"
                value={form.callrail_company_id}
                onChange={(e) => update("callrail_company_id", e.target.value)}
              />
            </div>
          ) : (
            <span className="form-hint" style={{ margin: "2px 0 0" }}>
              Pick a CallRail login above to see its companies, or{" "}
              <button
                type="button"
                className="link-toggle"
                style={{ display: "inline" }}
                onClick={() => setManualCallrail(true)}
              >
                enter IDs manually
              </button>
              .
            </span>
          )}
          {(callrailOptions.companies.length > 0 || (manualCallrail && form.callrail_connection_id)) && (
            <button type="button" className="link-toggle" onClick={() => setManualCallrail(!manualCallrail)}>
              {manualCallrail ? "Choose from list instead" : "Enter IDs manually instead"}
            </button>
          )}
          {callrailOptions.error && <span className="form-hint">{callrailOptions.error}</span>}
        </div>

        <PickOrTypeField
          label="GBP location"
          value={form.gbp_location_id}
          onChange={(v) => update("gbp_location_id", v)}
          options={googleOptions.gbpLocations}
          error={googleOptions.gbpError}
          manual={manualGbp}
          onManualToggle={setManualGbp}
          placeholder="locations/123456789"
        />

        <div className="form-field form-field-wide">
          <label>Google Ads customer ID</label>
          <input
            type="text"
            value={form.ads_customer_id}
            onChange={(e) => update("ads_customer_id", e.target.value)}
            placeholder="123-456-7890"
          />
          <span className="form-hint">
            Google Ads dropdown isn't available yet — it needs an approved developer token first. Manual entry for now.
          </span>
        </div>
      </div>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.has_ads}
          onChange={(e) => update("has_ads", e.target.checked)}
        />
        Running Google Ads for this account
      </label>

      <p className="form-hint">
        Leave any field blank if you don't have it yet — the account will show empty tiles for that
        source until the integration is wired up, but it'll appear on the dashboard right away.
      </p>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="btn-primary inline" disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : isEdit ? "Save changes" : "Add account"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => router.push(isEdit ? `/account/${initialAccount.id}` : "/")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
