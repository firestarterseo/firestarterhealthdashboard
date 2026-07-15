import Link from "next/link";
import { createAdminClient } from "../../../lib/supabase/admin";
import NewConnectionForm from "../../../components/NewConnectionForm";
import CallRailConnectionForm from "../../../components/CallRailConnectionForm";

export const dynamic = "force-dynamic";

async function getGoogleConnections() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agency_connections")
    .select("id, label, google_email, granted_scopes, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function getCallRailConnections() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("callrail_connections")
    .select("id, label, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export default async function ConnectionsPage({ searchParams }) {
  const connections = await getGoogleConnections();
  const callrailConnections = await getCallRailConnections();
  const connectedLabel = searchParams?.connected;
  const errorMsg = searchParams?.error;

  return (
    <div className="page">
      <Link href="/" className="back-btn">
        ← All accounts
      </Link>

      <h1>Agency Google connections</h1>
      <p className="subtitle">
        Connect each shared agency Google login once. GA4, Search Console, and Business Profile
        data for every client account mapped to that login pulls in automatically afterward.
      </p>

      {connectedLabel && (
        <div className="banner">
          Connected <strong>{connectedLabel}</strong> successfully.
        </div>
      )}
      {errorMsg && (
        <div className="banner">
          Something went wrong connecting that account: <strong>{errorMsg}</strong>. Try again, or
          check the OAuth client's redirect URI matches exactly.
        </div>
      )}

      <div className="soft-card">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Google account</th>
              <th>Scopes granted</th>
              <th>Connected</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td>{c.google_email || "—"}</td>
                <td>{c.granted_scopes?.length || 0} scopes</td>
                <td>{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {connections.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-state">
                  No connections yet — add your first agency login below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <NewConnectionForm />

      <h1 style={{ marginTop: 56 }}>Agency CallRail connections</h1>
      <p className="subtitle">
        CallRail uses a static API key instead of a Google-style sign-in. Paste one key per shared
        CallRail login below — every account/company visible to that key becomes selectable on the
        Add Account form.
      </p>

      <div className="soft-card">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Connected</th>
            </tr>
          </thead>
          <tbody>
            {callrailConnections.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td>{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {callrailConnections.length === 0 && (
              <tr>
                <td colSpan={2} className="empty-state">
                  No CallRail connections yet — add your first API key below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CallRailConnectionForm />
    </div>
  );
}
