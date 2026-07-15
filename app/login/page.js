"use client";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="wordmark">FIRESTARTER</span>
        <p>Account Health Dashboard — team sign in</p>
        {status === "sent" ? (
          <p className="login-note">
            Check <strong>{email}</strong> for a sign-in link. You can close this tab.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="you@firestarterseo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="btn-primary" type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Sending link…" : "Send sign-in link"}
            </button>
            {error && <p className="login-error">{error}</p>}
          </form>
        )}
        <p className="login-note">
          New team member? Ask an admin to invite you from the Supabase dashboard first —
          this app doesn't have open self-signup.
        </p>
      </div>
    </div>
  );
}
