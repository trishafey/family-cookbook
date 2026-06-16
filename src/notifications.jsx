// Notifications page — pending invitations addressed to the cook,
// plus join requests for cookbooks they manage. Owners + editors
// approve a request by picking a role; declining drops it.

import { useEffect, useState, useCallback } from "react";

export function Notifications({ authEmail, onOpenCookbook }) {
  const [invites, setInvites] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [pendingAccounts, setPendingAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyToken, setBusyToken] = useState(null);
  const [busyJoinId, setBusyJoinId] = useState(null);
  const [busyAccountEmail, setBusyAccountEmail] = useState(null);
  const [pendingRole, setPendingRole] = useState({}); // joinReqId → role

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/notifications", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load notifications");
      const data = await res.json();
      setInvites(data.invitations || []);
      setJoinRequests(data.joinRequests || []);
      setPendingAccounts(data.pendingAccounts || []);
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

  const approveJoin = async (req) => {
    const role = pendingRole[req.id] || "viewer";
    setBusyJoinId(req.id);
    try {
      const res = await fetch(`/api/admin/cookbooks/${encodeURIComponent(req.cookbookId)}/join-requests/${req.id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not approve");
      }
      setJoinRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (err) {
      setError(err.message || "Could not approve request");
    } finally {
      setBusyJoinId(null);
    }
  };

  const declineJoin = async (req) => {
    setBusyJoinId(req.id);
    try {
      const res = await fetch(`/api/admin/cookbooks/${encodeURIComponent(req.cookbookId)}/join-requests/${req.id}/decline`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not decline");
      }
      setJoinRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (err) {
      setError(err.message || "Could not decline request");
    } finally {
      setBusyJoinId(null);
    }
  };

  const decideAccount = async (account, action) => {
    setBusyAccountEmail(account.email);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(account.email)}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Could not ${action}`);
      }
      setPendingAccounts(prev => prev.filter(a => a.email !== account.email));
    } catch (err) {
      setError(err.message || `Could not ${action} account`);
    } finally {
      setBusyAccountEmail(null);
    }
  };

  const empty = invites.length === 0 && joinRequests.length === 0 && pendingAccounts.length === 0;

  return (
    <div className="notifications-page" data-screen-label="Notifications">
      <div className="page-header">
        <div className="eyebrow">Updates</div>
        <h1><em>Notifications</em></h1>
        <div className="intro">Cookbook invitations, join requests, and updates.</div>
      </div>

      {loading ? (
        <div className="notifications-loading">Loading…</div>
      ) : error ? (
        <div className="notifications-error">{error}</div>
      ) : empty ? (
        <div className="notifications-empty">
          <p>You're all caught up — no new notifications.</p>
        </div>
      ) : (
        <ul className="notifications-list">
          {invites.map(inv => (
            <li key={inv.token} className="notification-card">
              <div className="notification-eyebrow">Cookbook invitation</div>
              <h3 className="notification-title">
                <span className="from">{inv.invitedByName || inv.invitedBy}</span> invited you to{" "}
                <strong>{inv.cookbookName || "a cookbook"}</strong>
              </h3>
              {inv.cookbookBlurb && (
                <p className="notification-blurb">{inv.cookbookBlurb}</p>
              )}
              <div className="notification-meta">
                You'll join as a <strong>{inv.role === "viewer" ? "follower" : inv.role}</strong>.
              </div>
              <div className="notification-actions">
                <button
                  className="btn primary sm"
                  disabled={busyToken === inv.token}
                  onClick={() => accept(inv.token, inv.cookbookId)}
                >
                  {busyToken === inv.token ? "Accepting…" : "Accept"}
                </button>
                <button
                  className="btn ghost sm"
                  disabled={busyToken === inv.token}
                  onClick={() => decline(inv.token)}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
          {joinRequests.map(req => {
            const name = req.displayName || `${req.firstName || ""} ${req.lastName || ""}`.trim() || req.email;
            const role = pendingRole[req.id] || "viewer";
            return (
              <li key={`join-${req.id}`} className="notification-card">
                <div className="notification-eyebrow">Request to join</div>
                <h3 className="notification-title">
                  <span className="from">{name}</span> wants to join{" "}
                  <strong>{req.cookbookName || "your cookbook"}</strong>
                </h3>
                {req.message && (
                  <p className="notification-blurb">"{req.message}"</p>
                )}
                <div className="notification-meta">
                  Add as{" "}
                  <select
                    value={role}
                    onChange={(e) => setPendingRole(prev => ({ ...prev, [req.id]: e.target.value }))}
                    className="cb-role-select"
                  >
                    <option value="viewer">Follower</option>
                    <option value="editor">Editor</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
                <div className="notification-actions">
                  <button
                    className="btn primary sm"
                    disabled={busyJoinId === req.id}
                    onClick={() => approveJoin(req)}
                  >
                    {busyJoinId === req.id ? "Approving…" : "Approve"}
                  </button>
                  <button
                    className="btn ghost sm"
                    disabled={busyJoinId === req.id}
                    onClick={() => declineJoin(req)}
                  >
                    Decline
                  </button>
                </div>
              </li>
            );
          })}
          {pendingAccounts.map(account => {
            const name = account.displayName || `${account.firstName || ""} ${account.lastName || ""}`.trim() || account.email;
            return (
              <li key={`account-${account.email}`} className="notification-card">
                <div className="notification-eyebrow">New account · admin only</div>
                <h3 className="notification-title">
                  <span className="from">{name}</span> signed up and is waiting for approval
                </h3>
                <p className="notification-blurb">{account.email}</p>
                <div className="notification-actions">
                  <button
                    className="btn primary sm"
                    disabled={busyAccountEmail === account.email}
                    onClick={() => decideAccount(account, "approve")}
                  >
                    {busyAccountEmail === account.email ? "Approving…" : "Approve"}
                  </button>
                  <button
                    className="btn ghost sm"
                    disabled={busyAccountEmail === account.email}
                    onClick={() => decideAccount(account, "decline")}
                  >
                    Decline
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
