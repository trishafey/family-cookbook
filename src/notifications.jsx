// Notifications page — surfaces pending invitations addressed to
// the signed-in cook. Lightweight today (just invites); the same
// surface will host other notification types later (info requests,
// big feature announcements).

import { useEffect, useState, useCallback } from "react";

export function Notifications({ authEmail, onOpenCookbook }) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyToken, setBusyToken] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/notifications", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load notifications");
      const data = await res.json();
      setInvites(data.invitations || []);
    } catch (err) {
      setError(err.message || "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authEmail) load();
  }, [authEmail, load]);

  const accept = async (token, cookbookId) => {
    setBusyToken(token);
    try {
      const res = await fetch(`/api/admin/invitations/${token}/accept`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not accept");
      }
      setInvites(prev => prev.filter(i => i.token !== token));
      onOpenCookbook?.(cookbookId);
    } catch (err) {
      setError(err.message || "Could not accept invitation");
    } finally {
      setBusyToken(null);
    }
  };

  const decline = async (token) => {
    setBusyToken(token);
    try {
      setInvites(prev => prev.filter(i => i.token !== token));
    } finally {
      setBusyToken(null);
    }
  };

  return (
    <div className="notifications-page" data-screen-label="Notifications">
      <div className="notifications-header">
        <h1 className="page-title">Notifications</h1>
        <p className="page-sub">Cookbook invitations and updates.</p>
      </div>

      {loading ? (
        <div className="notifications-loading">Loading…</div>
      ) : error ? (
        <div className="notifications-error">{error}</div>
      ) : invites.length === 0 ? (
        <div className="notifications-empty">
          <p>You're all caught up — no new notifications.</p>
        </div>
      ) : (
        <ul className="notifications-list">
          {invites.map(inv => (
            <li key={inv.token} className="notification-card">
              <div className="notification-eyebrow">Cookbook invitation</div>
              <h3 className="notification-title">
                <span className="from">{inv.invitedBy}</span> invited you to{" "}
                <strong>{inv.cookbookName || "a cookbook"}</strong>
              </h3>
              {inv.cookbookBlurb && (
                <p className="notification-blurb">{inv.cookbookBlurb}</p>
              )}
              <div className="notification-meta">
                You'll join as a <strong>{inv.role}</strong>.
              </div>
              <div className="notification-actions">
                <button
                  className="btn primary"
                  disabled={busyToken === inv.token}
                  onClick={() => accept(inv.token, inv.cookbookId)}
                >
                  {busyToken === inv.token ? "Accepting…" : "Accept"}
                </button>
                <button
                  className="btn ghost"
                  disabled={busyToken === inv.token}
                  onClick={() => decline(inv.token)}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
