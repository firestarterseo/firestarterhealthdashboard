"use client";
import { useState } from "react";

export default function NewConnectionForm() {
  const [label, setLabel] = useState("");
  function handleConnect(e) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    window.location.href = `/auth/google/start?label=${encodeURIComponent(trimmed)}`;
  }
  return (
    <form className="form-card" onSubmit={handleConnect} style={{ marginTop: 20 }}>
      <div className="form-field form-field-wide">
        <label>Label for this Google login</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Main 1"
          required
        />
      </div>
      <p className="form-hint">
        You'll be sent to Google to sign in with the account this label represents, and asked to
        approve read access to Analytics, Search Console, and Business Profile data. Do this once
        per agency login — every client account mapped to this label will pull data
        automatically afterward.
      </p>
      <div className="form-actions">
        <button type="submit" className="btn-primary inline">
          Connect Google account
        </button>
      </div>
    </form>
  );
}
