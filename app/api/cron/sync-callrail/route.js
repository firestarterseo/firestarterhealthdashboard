import { NextResponse } from "next/server";

// Deprecated — CallRail sync is now folded into the unified /api/cron/sync-metrics job
// alongside GA4, Search Console, and Business Profile. Kept as a no-op so any lingering
// references (bookmarks, old cron config) don't 404.
export async function GET() {
  return NextResponse.json({
    ok: true,
    deprecated: true,
    message: "CallRail sync moved to /api/cron/sync-metrics (runs all sources together).",
  });
}
