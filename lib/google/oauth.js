import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_SCOPES,
} from "./config";

export function buildAuthUrl(label) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES.join(" "),
    state: label || "",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Server misconfiguration: GOOGLE_CLIENT_ID is not set in this deployment's runtime env.");
  }
  if (!GOOGLE_CLIENT_SECRET) {
    throw new Error("Server misconfiguration: GOOGLE_CLIENT_SECRET is not set in this deployment's runtime env.");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "Failed to exchange code for tokens");
  }
  return data;
}

// Exchanges a stored agency_connections.refresh_token for a short-lived access token.
// Used whenever we need to call GA4 / Search Console / Business Profile APIs on demand
// (e.g. populating the account dropdowns) rather than at OAuth-callback time.
export async function refreshAccessToken(refreshToken) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Server misconfiguration: GOOGLE_CLIENT_ID is not set in this deployment's runtime env.");
  }
  if (!GOOGLE_CLIENT_SECRET) {
    throw new Error("Server misconfiguration: GOOGLE_CLIENT_SECRET is not set in this deployment's runtime env.");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "Failed to refresh Google access token");
  }
  return data.access_token;
}

export async function getGoogleUserEmail(accessToken) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}
