"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CallRailConnectionForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedLabel = label.trim();
    const trimmedKey = apiKey.trim();
    if (!trimmedLabel || !trimmedKey) {
      setError("Label and API key are both required.");
      return;
    }
    setStatus("saving");
    setError("");
    const res = await fetch("/api/callrail/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: trimmedLabel, apiKey: trimmedKey }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setStatus("error");
      setError(data.error || "Something went wrong saving that connection.");
      return;
    }
    setLabel("");
    setApiKey("");
    setStatus("idle");
    router.refresh();
  }

  return (
    <form className="form-card" onSubmit={handleSubmit} style={{ marginTop: 20 }}>
      <div className="form-grid">
        <div className="form-field">
          <label>Label for this CallRail login</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Main CallRail"
            required
          />
        </div>
        <div className="form-field">
          <label>API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your CallRail API key"
            required
          />
        </div>
      </div>
      <p className="form-hint">
        Find this under CallRail → Settings → API Keys. It's scoped to whatever accounts/companies
        that CallRail user can see, so one key here covers every client account under it.
        Stored server-side only — never shown again after saving.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn-primary inline" disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save CallRail connection"}
        </button>
      </div>
    </form>
  );
}
