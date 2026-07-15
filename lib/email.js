// Sends the daily alert digest email via Resend (https://resend.com).
// Requires two env vars in Vercel -> Project -> Settings -> Environment Variables:
//   RESEND_API_KEY    - the Resend API key
//   ALERT_TO_EMAILS   - comma-separated list of recipient addresses, e.g. "jeff@firestarterseo.com,skyler@firestarterseo.com"
// Optional:
//   ALERT_FROM_EMAIL  - defaults to "alerts@firestarterseo.com" — must be on a domain verified in Resend,
//                       since Resend's shared onboarding@resend.dev sender can only deliver to the
//                       account owner's own email, not a real recipient list.
export async function sendAlertDigestEmail(flaggedAccounts) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmails = (process.env.ALERT_TO_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (!apiKey) {
    return { sent: false, reason: "RESEND_API_KEY is not set." };
  }
  if (!toEmails.length) {
    return { sent: false, reason: "ALERT_TO_EMAILS is not set." };
  }
  if (!flaggedAccounts.length) {
    return { sent: false, reason: "No flagged accounts, nothing to send." };
  }

  const rows = flaggedAccounts
    .map(
      (a) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${a.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-transform:capitalize;color:${
          a.severity === "critical" ? "#c22a24" : "#b35d1a"
        };font-weight:600;">${a.severity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${a.reason}</td>
      </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Arial,sans-serif;color:#1d1525;">
      <h2 style="margin:0 0 4px;">Firestarter Health Dashboard</h2>
      <p style="color:#666;margin:0 0 20px;">${flaggedAccounts.length} account(s) flagged today</p>
      <table style="border-collapse:collapse;width:100%;max-width:600px;">
        <thead>
          <tr style="background:#fafaf8;">
            <th style="text-align:left;padding:8px 12px;">Account</th>
            <th style="text-align:left;padding:8px 12px;">Status</th>
            <th style="text-align:left;padding:8px 12px;">Reason</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:24px;">
        <a href="https://firestarterhealthdashboard.vercel.app" style="color:#f27f30;">Open the dashboard →</a>
      </p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERT_FROM_EMAIL || "alerts@firestarterseo.com",
      to: toEmails,
      subject: `Firestarter Health Dashboard: ${flaggedAccounts.length} account(s) need attention`,
      html,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { sent: false, reason: data.message || `Resend request failed (${res.status})` };
  }

  const data = await res.json();
  return { sent: true, id: data.id };
}
