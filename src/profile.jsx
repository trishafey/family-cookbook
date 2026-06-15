// Holding screen for cooks whose account hasn't been approved yet.
// Hit after sign-up if Patricia hasn't approved them. Shows the
// pending state, lets them sign out, and refreshes itself so an
// approved user doesn't have to manually reload.
import { useState } from "react";
export function PendingApprovalGate({ authEmail, refreshProfile }) {
  // Tracks whether the cook has tapped "Check status" at least
  // once. If they have AND the gate is still rendering (i.e.
  // status is still pending), we surface a soft "still waiting"
  // message with a nudge to ping their inviter rather than
  // tapping forever in silence.
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      await refreshProfile();
    } finally {
      setChecking(false);
      setChecked(true);
    }
  };

  return (
    <div className="profile-gate" data-screen-label="10b Pending approval">
      <div className="profile-card">
        <div className="eyebrow">You're on the list</div>
        <h1>Thanks for signing up.</h1>
        <p className="sub">
          We're a small family cookbook, so new accounts get a quick once-over before they're in. Patricia will see your request shortly and let you in. We'll send a note when you're approved.
        </p>
        <p className="sub" style={{ marginTop: 12, fontSize: 14, color: "var(--ink-3)" }}>
          Signed in as <strong>{authEmail}</strong>.
        </p>
        {checked && (
          <div className="pending-still-waiting">
            Still pending — Patricia hasn't approved your account yet. Try again in a little while, or give whoever invited you a nudge to remind them.
          </div>
        )}
        <div className="actions" style={{ justifyContent: "flex-start", gap: 8 }}>
          <button type="button" className="btn primary" onClick={check} disabled={checking}>
            {checking ? "Checking…" : "Check status"}
          </button>
          <a className="btn ghost" href="/cdn-cgi/access/logout">Sign out</a>
        </div>
      </div>
    </div>
  );
}

// Phase 4b-2 follow-up — first-sign-in profile setup.
//
// Gates the app behind a name + phone form for any cook whose
// users row doesn't have first_name / last_name yet. Triggered
// for new signups (post-Phase 4b state-2 self-serve) and for the
// existing family members whose pre-seeded rows have NULL
// profile fields.
//
// Phone is optional today (MFA verification is a later state).
// An "Account settings" page will let cooks edit these later.

import { Icon } from "./helpers.jsx";

export function ProfileSetupGate({ authEmail, onSaved, onSignOut, save }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const profile = await save({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
      onSaved?.(profile);
    } catch (err) {
      setError(err.message || "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-gate" data-screen-label="10 Profile setup">
      <div className="profile-card">
        <div className="eyebrow">Almost in</div>
        <h1>Tell us who you are</h1>
        <p className="sub">
          Signed in as <strong>{authEmail}</strong>. We use your name to attribute recipes you add and to show
          inviters who you are when they share a cookbook with you.
        </p>

        <form onSubmit={submit}>
          <div className="row">
            <label className="field">
              <span>First name</span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                required
                maxLength={60}
                autoComplete="given-name"
              />
            </label>
            <label className="field">
              <span>Last name</span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                maxLength={60}
                autoComplete="family-name"
              />
            </label>
          </div>

          <label className="field">
            <span>Phone <span className="opt">(optional, we'll verify later)</span></span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={32}
              autoComplete="tel"
              placeholder="+1 555 555 5555"
            />
          </label>

          {error && <div className="profile-error">{error}</div>}

          <div className="actions">
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Saving…" : "Continue"}
            </button>
            {onSignOut && (
              <a className="btn ghost" href={onSignOut}>Sign out</a>
            )}
          </div>
        </form>

        <div className="footnote">
          <Icon name="sparkle" size={11} />
          You can edit these in your account settings later.
        </div>
      </div>
    </div>
  );
}
