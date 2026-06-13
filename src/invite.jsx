// Phase 4b-2 — invitation acceptance page.
//
// Visited at /invite/:token. Reads the invitation publicly (no
// auth — the token is the capability) and shows the cookbook
// name + role + inviter. Signed-out cooks see a "Sign in to
// accept" CTA; signed-in cooks see "Accept invitation" which
// POSTs to /api/admin/invitations/:token/accept and drops them
// into the new cookbook.

import { useEffect, useState } from "react";
import { Icon, signInUrl, SIGN_OUT_URL } from "./helpers.jsx";

export function InviteAccept({ token, authEmail, onAccepted, onClose }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const [wrongAccount, setWrongAccount] = useState(null); // { expectedEmail, signedInAs }
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invitations/${token}`);
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? "This invitation is invalid or has been revoked." : "Could not load invitation.");
          return;
        }
        const data = await res.json();
        if (!cancelled) setInvite(data);
      } catch {
        if (!cancelled) setError("Could not load invitation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    setError(null);
    setWrongAccount(null);
    try {
      const res = await fetch(`/api/admin/invitations/${token}/accept`, {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === "wrong account") {
          setWrongAccount({ expectedEmail: data.expectedEmail, signedInAs: data.signedInAs });
          return;
        }
      }
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Could not accept invitation`);
      }
      const { cookbookId } = await res.json();
      setDone(true);
      onAccepted?.(cookbookId);
    } catch (err) {
      setError(err.message || "Could not accept invitation.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="invite-page" data-screen-label="09 Accept invitation">
      <div className="invite-card">
        {loading ? (
          <div className="invite-loading">Loading invitation…</div>
        ) : error ? (
          <>
            <div className="eyebrow">Invitation</div>
            <h2>Something's not right</h2>
            <p className="invite-error">{error}</p>
            <button className="btn ghost" onClick={onClose}>Back to the cookbook</button>
          </>
        ) : invite?.acceptedAt ? (
          <>
            <div className="eyebrow">Already accepted</div>
            <h2>You're in</h2>
            <p>This invitation has already been accepted. {invite.cookbookName} is in your cookbooks.</p>
            <button className="btn primary" onClick={() => onAccepted?.(invite.cookbookId)}>Open it</button>
          </>
        ) : invite?.expired ? (
          <>
            <div className="eyebrow">Expired</div>
            <h2>This invitation has expired</h2>
            <p>Ask the inviter to send you a fresh link.</p>
            <button className="btn ghost" onClick={onClose}>Back to the cookbook</button>
          </>
        ) : wrongAccount ? (
          <>
            <div className="eyebrow">Wrong account</div>
            <h2>This invitation is for <span className="from">{wrongAccount.expectedEmail}</span></h2>
            <p>You're signed in as <strong>{wrongAccount.signedInAs}</strong>. Sign out and sign back in as the invited address.</p>
            <a className="btn primary" href={SIGN_OUT_URL}>
              Sign out
            </a>
            <button className="btn ghost" onClick={onClose}>Decide later</button>
          </>
        ) : done ? (
          <>
            <div className="eyebrow">Welcome</div>
            <h2>You're in</h2>
            <p>{invite.cookbookName} is now in your library.</p>
            <button className="btn primary" onClick={() => onAccepted?.(invite.cookbookId)}>Open it</button>
          </>
        ) : (
          <>
            <div className="eyebrow">Invitation</div>
            <h2>
              <span className="from">{invite.invitedBy}</span> invited you to
            </h2>
            <div className="cookbook-name">{invite.cookbookName}</div>
            {invite.cookbookBlurb && <p className="blurb">{invite.cookbookBlurb}</p>}
            <div className="role-info">
              You'll join as a <strong>{invite.role}</strong>.
            </div>
            {!authEmail ? (
              <>
                <a className="btn primary" href={signInUrl()}>
                  <Icon name="chef" size={15} /> Sign in to accept
                </a>
                <p className="invite-hint">
                  After signing in, you'll be brought back here to accept.
                </p>
              </>
            ) : (
              <>
                <button className="btn primary" onClick={accept} disabled={accepting}>
                  {accepting ? "Joining…" : "Accept invitation"}
                </button>
                <p className="invite-hint">
                  Signed in as <strong>{authEmail}</strong>.
                </p>
              </>
            )}
            <button className="btn ghost" onClick={onClose}>Decline</button>
          </>
        )}
      </div>
    </div>
  );
}
