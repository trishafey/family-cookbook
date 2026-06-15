// Lightweight modal that surfaces just the "Invite by email"
// portion of MembersSection. Opened from the cookbook header
// action row when the cook taps "Invite cook" — saves them
// having to jump into the manage page just to fire one invite.

import { useEffect, useState } from "react";
import { Icon } from "./helpers.jsx";
import { NetworkPicker } from "./cookbooks.jsx";

export function InviteCookModal({ cookbook, onClose }) {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [network, setNetwork] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);
  const [error, setError] = useState(null);
  const [lastInvite, setLastInvite] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/cookbooks/${cookbook.id}`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
      fetch(`/api/admin/cookbooks/${cookbook.id}/invitations`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
      fetch("/api/admin/me/network", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    ]).then(([cb, inv, net]) => {
      if (cb?.members) setMembers(cb.members);
      if (inv?.invitations) setInvitations(inv.invitations);
      if (net?.network) setNetwork(net.network);
    }).catch(() => {});
  }, [cookbook.id]);

  const niceName = (p) => p.displayName || [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email;

  const buildInviteMessage = (cookbookName, inviteEmail, link) => {
    const parts = [`You've been invited to ${cookbookName} on Heirloom.`];
    if (inviteEmail) parts.push(`Sign in with ${inviteEmail} to accept:`);
    else parts.push(`Accept here:`);
    parts.push(link);
    return parts.join(" ");
  };

  const sendInvite = async (email, role) => {
    setInviting(true);
    setError(null);
    const cleanEmail = (email || "").trim().toLowerCase() || null;
    try {
      const res = await fetch(`/api/admin/cookbooks/${cookbook.id}/invitations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, role: role || "editor" }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Invite failed (${res.status})`);
      }
      const { invitation, link } = await res.json();
      setInvitations(prev => [{ ...invitation, link }, ...prev]);
      setLastInvite({ email: invitation.email, link, token: invitation.token });
      try {
        await navigator.clipboard.writeText(buildInviteMessage(cookbook.name, invitation.email, link));
        setCopiedToken(invitation.token);
        setTimeout(() => setCopiedToken(null), 2200);
      } catch {}
    } catch (err) {
      setError(err.message || "Could not create invitation.");
    } finally {
      setInviting(false);
    }
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    await sendInvite(inviteEmail, inviteRole);
    setInviteEmail("");
  };

  const alreadyHere = new Set([
    ...members.map(m => m.email?.toLowerCase()),
    ...invitations.map(i => (i.email || "").toLowerCase()).filter(Boolean),
  ]);
  const availableNetwork = network.filter(p => !alreadyHere.has(p.email?.toLowerCase()));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cookbook-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Invite a cook">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
        <div className="eyebrow">Invite</div>
        <h2>Invite a cook to {cookbook.name}</h2>
        <p className="modal-sub">
          They'll get an email invitation. Once they accept, they show up in Members with the role you pick here.
        </p>

        <div className="invite-role-row">
          <label>
            New invites join as
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} disabled={inviting}>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
        </div>

        <NetworkPicker
          networkAvailable={availableNetwork}
          manualEmail={inviteEmail}
          setManualEmail={setInviteEmail}
          addInvite={(email) => sendInvite(email, inviteRole)}
          niceName={niceName}
        />

        {error && <div className="modal-error">{error}</div>}

        {lastInvite && (
          <div className="invite-confirmation">
            <Icon name="check" size={14} />
            {copiedToken === lastInvite.token
              ? <>Invite sent to <strong>{lastInvite.email || "the link"}</strong> — link copied to your clipboard too.</>
              : <>Invite sent to <strong>{lastInvite.email || "the link"}</strong>.</>
            }
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
