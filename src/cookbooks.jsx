// Phase 4b-1 — "My cookbooks" index with create / rename / delete.
//
// Reads the caller's cookbook memberships from
// /api/admin/cookbooks (the server auto-bootstraps a personal
// cookbook on first hit). Owners can rename, change visibility,
// and delete (only when the cookbook has zero recipes).
// Invitations + member management land in 4b-2.

import { useEffect, useState } from "react";
import { Icon, signInUrl } from "./helpers.jsx";

function CreateCookbookModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e?.preventDefault?.();
    const n = name.trim();
    if (!n) { setError("Give it a name."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cookbooks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, blurb, visibility }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Create failed (${res.status})`);
      }
      const { cookbook } = await res.json();
      onCreated(cookbook);
    } catch (err) {
      setError(err.message || "Could not create cookbook.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cookbook-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create a cookbook">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
        <div className="eyebrow">New cookbook</div>
        <h2>Start a cookbook</h2>
        <p className="modal-sub">A personal collection, a project, a friend's shared book.</p>

        <form onSubmit={submit}>
          <label className="modal-field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weeknight Quick"
              autoFocus
              maxLength={80}
            />
          </label>

          <label className="modal-field">
            <span>One-line blurb</span>
            <input
              type="text"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              placeholder="What's this cookbook about?"
              maxLength={280}
            />
          </label>

          <fieldset className="modal-field">
            <legend>Visibility</legend>
            <label className="radio">
              <input type="radio" checked={visibility === "private"} onChange={() => setVisibility("private")} />
              <span><strong>Private</strong> — only you and people you invite.</span>
            </label>
            <label className="radio">
              <input type="radio" checked={visibility === "unlisted"} onChange={() => setVisibility("unlisted")} />
              <span><strong>Unlisted</strong> — anyone with the link can view.</span>
            </label>
            <label className="radio">
              <input type="radio" checked={visibility === "public"} onChange={() => setVisibility("public")} />
              <span><strong>Public</strong> — listed in the directory (coming soon).</span>
            </label>
          </fieldset>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving || !name.trim()}>
              {saving ? "Creating…" : "Create cookbook"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MembersSection({ cookbook, authEmail, onMembersChanged }) {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);
  const [lastSentEmail, setLastSentEmail] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const [cbRes, invRes] = await Promise.all([
        fetch(`/api/admin/cookbooks/${cookbook.id}`, { credentials: "include" }),
        fetch(`/api/admin/cookbooks/${cookbook.id}/invitations`, { credentials: "include" }),
      ]);
      if (cbRes.ok) {
        const data = await cbRes.json();
        setMembers(data.members || []);
      }
      if (invRes.ok) {
        const data = await invRes.json();
        setInvitations(data.invitations || []);
      }
    } catch {
      setError("Could not load members.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cookbook.id]);

  const invite = async (e) => {
    e?.preventDefault?.();
    setInviting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cookbooks/${cookbook.id}/invitations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() || null, role: inviteRole }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Invite failed (${res.status})`);
      }
      const { invitation, link, emailSent, emailError } = await res.json();
      setInvitations(prev => [{ ...invitation, link, emailSent }, ...prev]);
      setInviteEmail("");
      // Email-delivered invites get a "Sent to email@" toast; if
      // delivery failed (or the inviter created an open invite),
      // copy the link to the clipboard so they can share it.
      if (emailSent) {
        setLastSentEmail(invitation.email);
        setTimeout(() => setLastSentEmail(null), 3500);
      } else {
        try { await navigator.clipboard.writeText(link); setCopiedToken(invitation.token); setTimeout(() => setCopiedToken(null), 2200); } catch {}
        if (emailError && emailError !== "no recipient" && emailError !== "not configured") {
          setError(`Created the invite, but email delivery failed (${emailError}). The link's been copied to your clipboard.`);
        }
      }
    } catch (err) {
      setError(err.message || "Could not create invitation.");
    } finally {
      setInviting(false);
    }
  };

  const revoke = async (token) => {
    try {
      await fetch(`/api/admin/cookbooks/${cookbook.id}/invitations/${token}`, {
        method: "DELETE", credentials: "include",
      });
      setInvitations(prev => prev.filter(i => i.token !== token));
    } catch {}
  };

  const copyLink = async (link, token) => {
    try { await navigator.clipboard.writeText(link); setCopiedToken(token); setTimeout(() => setCopiedToken(null), 1800); } catch {}
  };

  const changeRole = async (email, role) => {
    try {
      const res = await fetch(`/api/admin/cookbooks/${cookbook.id}/members/${encodeURIComponent(email)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Could not change role`);
      }
      setMembers(prev => prev.map(m => m.email === email ? { ...m, role } : m));
      onMembersChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeMember = async (email) => {
    if (!confirm(`Remove ${email}?`)) return;
    try {
      const res = await fetch(`/api/admin/cookbooks/${cookbook.id}/members/${encodeURIComponent(email)}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Could not remove member`);
      }
      setMembers(prev => prev.filter(m => m.email !== email));
      onMembersChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="members-loading">Loading members…</div>;

  return (
    <div className="members-section">
      <div className="section-head">Members</div>
      {error && <div className="modal-error">{error}</div>}
      <ul className="members-list">
        {members.map(m => (
          <li key={m.email} className="member-row">
            <div className="who">
              <div className="name">{m.displayName || m.email}</div>
              {m.displayName && <div className="email">{m.email}</div>}
            </div>
            <select
              className="role-select"
              value={m.role}
              onChange={(e) => changeRole(m.email, e.target.value)}
              disabled={m.email === authEmail && m.role === "owner"}
              title={m.email === authEmail && m.role === "owner" ? "Promote someone else first to demote yourself" : "Change role"}
            >
              <option value="owner">owner</option>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button
              type="button"
              className="btn ghost sm member-remove"
              onClick={() => removeMember(m.email)}
              disabled={m.email === authEmail && m.role === "owner"}
              aria-label="Remove member"
              title={m.email === authEmail && m.role === "owner" ? "Promote someone else first" : "Remove member"}
            >
              <Icon name="x" size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="section-head">Invite someone</div>
      <form className="invite-form" onSubmit={invite}>
        <input
          type="email"
          placeholder="friend@example.com (optional)"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
        />
        <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
          <option value="editor">editor</option>
          <option value="viewer">viewer</option>
        </select>
        <button type="submit" className="btn primary sm" disabled={inviting}>
          {inviting ? "Creating…" : "Create invite link"}
        </button>
      </form>
      <div className="invite-hint">
        Email gets sent automatically when configured. Otherwise the link is copied to your clipboard — share it however you like. Expires in 14 days.
      </div>

      {lastSentEmail && (
        <div className="invite-toast">
          <Icon name="check" size={13} /> Invitation sent to <strong>{lastSentEmail}</strong>.
        </div>
      )}

      {invitations.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 18 }}>Pending invitations</div>
          <ul className="invitations-list">
            {invitations.map(inv => (
              <li key={inv.token} className="invitation-row">
                <div className="who">
                  <div className="name">
                    {inv.email || "Anyone with the link"} <span className="role-tag">{inv.role}</span>
                    {inv.emailSent && <span className="email-sent-tag" title="Invite emailed">emailed</span>}
                  </div>
                  <div className="meta">expires {new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                </div>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => copyLink(inv.link, inv.token)}
                >
                  {copiedToken === inv.token ? "Copied!" : "Copy link"}
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => revoke(inv.token)}
                  aria-label="Revoke invitation"
                >
                  <Icon name="x" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EditCookbookModal({ cookbook, initialTab, authEmail, onClose, onSaved, onDeleted, onMembersChanged }) {
  const [tab, setTab] = useState(initialTab || "settings");
  const [name, setName] = useState(cookbook.name);
  const [blurb, setBlurb] = useState(cookbook.blurb || "");
  const [visibility, setVisibility] = useState(cookbook.visibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cookbooks/${cookbook.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), blurb, visibility }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Save failed (${res.status})`);
      }
      onSaved({ ...cookbook, name: name.trim(), blurb, visibility });
    } catch (err) {
      setError(err.message || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cookbooks/${cookbook.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Delete failed (${res.status})`);
      }
      onDeleted(cookbook.id);
    } catch (err) {
      setError(err.message || "Could not delete cookbook.");
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cookbook-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cookbook settings">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
        <div className="eyebrow">Cookbook settings</div>
        <h2>{cookbook.name}</h2>

        <div className="tabbed-nav" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "settings"} className={`tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>Settings</button>
          <button type="button" role="tab" aria-selected={tab === "members"} className={`tab ${tab === "members" ? "active" : ""}`} onClick={() => setTab("members")}>Members</button>
        </div>

        {tab === "settings" && (
          <>
            <form onSubmit={submit}>
              <label className="modal-field">
                <span>Name</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </label>

              <label className="modal-field">
                <span>One-line blurb</span>
                <input type="text" value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={280} />
              </label>

              <fieldset className="modal-field">
                <legend>Visibility</legend>
                <label className="radio">
                  <input type="radio" checked={visibility === "private"} onChange={() => setVisibility("private")} />
                  <span><strong>Private</strong></span>
                </label>
                <label className="radio">
                  <input type="radio" checked={visibility === "unlisted"} onChange={() => setVisibility("unlisted")} />
                  <span><strong>Unlisted</strong></span>
                </label>
                <label className="radio">
                  <input type="radio" checked={visibility === "public"} onChange={() => setVisibility("public")} />
                  <span><strong>Public</strong></span>
                </label>
              </fieldset>

              {error && <div className="modal-error">{error}</div>}

              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving || !name.trim()}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>

            {cookbook.id !== "family-cookbook" && (
              <div className="modal-danger">
                <div className="head">Danger zone</div>
                {confirmDelete ? (
                  <div className="danger-actions">
                    <p>Really delete <strong>{cookbook.name}</strong>? Empty cookbooks only — recipes must be moved first.</p>
                    <div className="modal-actions">
                      <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                      <button type="button" className="btn danger" onClick={doDelete} disabled={saving}>
                        {saving ? "Deleting…" : "Delete cookbook"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn ghost danger-link" onClick={() => setConfirmDelete(true)}>
                    Delete this cookbook
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {tab === "members" && (
          <MembersSection cookbook={cookbook} authEmail={authEmail} onMembersChanged={onMembersChanged} />
        )}
      </div>
    </div>
  );
}

export function CookbooksIndex({ authEmail, activeCookbookId, onClose, onOpenCookbook }) {
  const [cookbooks, setCookbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  // editing = { cookbook, tab? } so the onboarding banner can
  // open the modal directly on the Members tab.
  const [editing, setEditing] = useState(null);
  // Local one-time dismiss for the "invite your family" prompt
  // so it doesn't keep nagging cooks who've decided to skip.
  const [familyPromptDismissed, setFamilyPromptDismissed] = useState(() => {
    try { return localStorage.getItem("onboarding:familyPromptDismissed") === "1"; } catch { return false; }
  });
  const dismissFamilyPrompt = () => {
    setFamilyPromptDismissed(true);
    try { localStorage.setItem("onboarding:familyPromptDismissed", "1"); } catch {}
  };

  const load = async () => {
    if (!authEmail) { setLoading(false); return; }
    setError(null);
    try {
      const res = await fetch("/api/admin/cookbooks", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { cookbooks: list } = await res.json();
      setCookbooks(list || []);
    } catch (err) {
      setError("Could not load your cookbooks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [authEmail]);

  return (
    <div className="cookbooks-page" data-screen-label="08 My Cookbooks">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      <div className="cookbooks-header">
        <div className="lhs">
          <div className="eyebrow">Your library</div>
          <h1>My <em>cookbooks</em></h1>
          <div className="intro">
            The cookbooks you own and the ones you've been invited to.
          </div>
        </div>
        {authEmail && (
          <button className="btn primary" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" /> New cookbook
          </button>
        )}
      </div>

      {!authEmail && (
        <div className="cookbooks-empty">
          <p><a href={signInUrl()}>Sign in</a> to see your cookbooks.</p>
        </div>
      )}

      {error && <div className="cookbooks-empty" style={{ color: "#933" }}>{error}</div>}

      {/* Onboarding: prompt the cook to invite people to their
          freshly-bootstrapped family cookbook. Detected
          structurally so it works for any cook, not just
          Patricia. Dismissable, but reappears across devices
          until they've actually invited someone (4b-5). */}
      {!familyPromptDismissed && (() => {
        const family = cookbooks.find(c =>
          (/family/i.test(c.id) || /Family Cookbook/i.test(c.name)) &&
          c.yourRole === "owner"
        );
        if (!family) return null;
        return (
          <div className="onboarding-prompt">
            <div className="t">
              <div className="eyebrow">Get started</div>
              <h3>Invite your family to {family.name}</h3>
              <p>Family cookbooks shine when they're shared. Send an invite link by email — they'll join with viewer or editor access.</p>
            </div>
            <div className="actions">
              <button className="btn primary" onClick={() => setEditing({ cookbook: family, tab: "members" })}>
                <Icon name="plus" size={14} /> Invite people
              </button>
              <button className="btn ghost sm" onClick={dismissFamilyPrompt}>Dismiss</button>
            </div>
          </div>
        );
      })()}

      {loading ? (
        <div style={{ marginTop: 32, color: "var(--ink-3)" }}>Loading your cookbooks…</div>
      ) : cookbooks.length === 0 && authEmail && !error ? (
        <div className="cookbooks-empty">
          <p>No cookbooks yet. Hit <em>New cookbook</em> to start one.</p>
        </div>
      ) : (() => {
        // Bucket cookbooks into three sections:
        //   - owned: cookbooks the cook owns (their personal +
        //     family come first here)
        //   - shared: cookbooks where they're editor/viewer
        //   - adminAccess: cookbooks they see only via admin
        const owned = cookbooks.filter(c => c.yourRole === "owner");
        const shared = cookbooks.filter(c => c.yourRole === "editor" || c.yourRole === "viewer");
        const adminAccess = cookbooks.filter(c => c.adminAccess || (c.yourRole === "admin" && !c.adminAccess));
        // Sort owned so personal + family come first, custom cookbooks after.
        const ownedSorted = [...owned].sort((a, b) => {
          const score = (c) => {
            if (/^personal-/i.test(c.id) || /'s Cookbook$/i.test(c.name)) return 0;
            if (/family/i.test(c.id) || /Family Cookbook/i.test(c.name)) return 1;
            return 2;
          };
          return score(a) - score(b);
        });
        const renderCard = (cb) => {
          const isOwner = cb.yourRole === "owner";
          const canManage = isOwner || cb.yourRole === "admin";
          return (
            <div
              key={cb.id}
              className={`cookbook-card ${cb.id === activeCookbookId ? "active" : ""}`}
            >
              <div className="cookbook-card-head">
                <div className={`role-badge role-${cb.yourRole}`}>
                  {cb.adminAccess ? "admin access" : cb.yourRole}
                </div>
                <div className={`vis-badge vis-${cb.visibility}`}>{cb.visibility}</div>
                {cb.id === activeCookbookId && (
                  <div className="role-badge active-badge">Active</div>
                )}
                {canManage && (
                  <button
                    type="button"
                    className="cookbook-card-edit"
                    onClick={(e) => { e.stopPropagation(); setEditing({ cookbook: cb }); }}
                    title="Cookbook settings"
                    aria-label="Cookbook settings"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="cookbook-card-body"
                onClick={() => onOpenCookbook?.(cb)}
              >
                <h3 className="cookbook-name">{cb.name}</h3>
                <div className="cookbook-blurb">{cb.blurb}</div>
                <div className="cookbook-meta">
                  <span>{cb.ownerEmail === authEmail ? "You own this" : `owned by ${cb.ownerEmail}`}</span>
                </div>
              </button>
            </div>
          );
        };
        return (
          <>
            {ownedSorted.length > 0 && (
              <section className="cookbook-section">
                <div className="section-head">Your cookbooks</div>
                <div className="cookbooks-grid">{ownedSorted.map(renderCard)}</div>
              </section>
            )}
            {shared.length > 0 && (
              <section className="cookbook-section">
                <div className="section-head">Shared with you</div>
                <div className="cookbooks-grid">{shared.map(renderCard)}</div>
              </section>
            )}
            {adminAccess.length > 0 && (
              <section className="cookbook-section">
                <div className="section-head">Admin access</div>
                <div className="cookbooks-grid">{adminAccess.map(renderCard)}</div>
              </section>
            )}
          </>
        );
      })()}

      {createOpen && (
        <CreateCookbookModal
          onClose={() => setCreateOpen(false)}
          onCreated={(cb) => {
            setCreateOpen(false);
            setCookbooks(prev => [...prev, cb]);
          }}
        />
      )}
      {editing && (
        <EditCookbookModal
          cookbook={editing.cookbook}
          initialTab={editing.tab || "settings"}
          authEmail={authEmail}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(null);
            setCookbooks(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
          }}
          onDeleted={(id) => {
            setEditing(null);
            setCookbooks(prev => prev.filter(c => c.id !== id));
          }}
          onMembersChanged={load}
        />
      )}
    </div>
  );
}
