// Phase 4b-1 — "My cookbooks" index with create / rename / delete.
//
// Reads the caller's cookbook memberships from
// /api/admin/cookbooks (the server auto-bootstraps a personal
// cookbook on first hit). Owners can rename, change visibility,
// and delete (only when the cookbook has zero recipes).
// Invitations + member management land in 4b-2.

import { useEffect, useRef, useState } from "react";
import { Icon, signInUrl } from "./helpers.jsx";
import { LANG_META, SUPPORTED_LANGS } from "./i18n.js";

const MAX_COOKBOOK_LANGS = 3;

// Multi-select language picker shared by Create + Edit cookbook
// modals. English is always present and locked; up to two
// additional languages can be toggled on as pills.
function LanguagePicker({ value, onChange }) {
  const selected = Array.isArray(value) && value.length ? value : ["en"];
  const toggle = (code) => {
    if (code === "en") return; // English is the base; can't remove
    if (selected.includes(code)) {
      onChange(selected.filter(c => c !== code));
    } else {
      if (selected.length >= MAX_COOKBOOK_LANGS) return;
      onChange([...selected, code]);
    }
  };
  return (
    <div className="lang-picker">
      <div className="lang-picker-pills">
        {SUPPORTED_LANGS.map(code => {
          const on = selected.includes(code);
          const meta = LANG_META[code];
          const locked = code === "en";
          const disabled = !on && !locked && selected.length >= MAX_COOKBOOK_LANGS;
          return (
            <button
              key={code}
              type="button"
              className={`lang-picker-pill ${on ? "on" : ""} ${locked ? "locked" : ""}`}
              onClick={() => toggle(code)}
              disabled={disabled}
              title={locked ? "English is always included" : disabled ? `Up to ${MAX_COOKBOOK_LANGS} languages` : meta?.label}
            >
              {meta?.label || code}
            </button>
          );
        })}
      </div>
      <div className="lang-picker-hint">
        Up to {MAX_COOKBOOK_LANGS} languages. English is always included; pick the others your cookbook needs.
      </div>
    </div>
  );
}

// Wrap a friendly note around the magic link so the inviter
// can paste a single block into a text message / DM / email
// instead of just a bare URL. Names the cookbook and (when
// the invite is pre-addressed) tells the recipient which email
// to sign in with — the auto-accept refuses any other address.
function buildInviteMessage(cookbookName, inviteEmail, link) {
  const parts = [`You've been invited to ${cookbookName} on Heirloom.`];
  if (inviteEmail) {
    parts.push(`Sign in with ${inviteEmail} to accept:`);
  } else {
    parts.push(`Accept here:`);
  }
  parts.push(link);
  return parts.join(" ");
}

// Admin · all cookbooks — searchable table covering every
// cookbook in the system. Used in the "My cookbooks" view for
// admins; for non-admins the underlying section just hides.
export function AdminCookbookTable({ cookbooks, activeCookbookId, authEmail, onOpenCookbook, onEdit }) {
  const [q, setQ] = useState("");
  const filtered = cookbooks.filter(c => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      c.name?.toLowerCase().includes(needle) ||
      c.ownerEmail?.toLowerCase().includes(needle) ||
      c.blurb?.toLowerCase().includes(needle) ||
      c.visibility?.toLowerCase().includes(needle) ||
      c.yourRole?.toLowerCase().includes(needle)
    );
  });
  return (
    <div className="admin-cookbooks">
      <div className="head-row">
        <div className="section-head">Admin · All cookbooks</div>
        <input
          type="search"
          className="admin-search"
          placeholder="Search name, owner, visibility…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Owner</th>
              <th>Visibility</th>
              <th className="num">Members</th>
              <th className="num">Recipes</th>
              <th>Your role</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="empty">No cookbooks match "{q}".</td></tr>
            ) : filtered.map(cb => (
              <tr key={cb.id} className={cb.id === activeCookbookId ? "active" : ""}>
                <td>
                  <button
                    type="button"
                    className="link"
                    onClick={() => onOpenCookbook?.(cb)}
                    title="Switch to this cookbook"
                  >
                    {cb.name}
                  </button>
                </td>
                <td className="email">{cb.ownerEmail === authEmail ? "you" : cb.ownerEmail}</td>
                <td><span className={`vis-badge vis-${cb.visibility}`}>{cb.visibility}</span></td>
                <td className="num">{cb.memberCount}</td>
                <td className="num">{cb.recipeCount}</td>
                <td>
                  <span className={`role-badge role-${cb.yourRole}`}>
                    {cb.adminAccess ? "admin" : cb.yourRole}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn ghost icon-only"
                    onClick={() => onEdit?.(cb)}
                    title="Cookbook settings"
                    aria-label="Cookbook settings"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-table-foot">
        {filtered.length} of {cookbooks.length} cookbooks
      </div>
    </div>
  );
}

// Tiny dropdown inside the onboarding banner — primary button
// "Invite people ▾" reveals a list of cookbooks the cook can
// invite into. Clicking a row hands the cookbook up to the
// parent so it can open the settings modal at the Members tab.
function InvitePicker({ cookbooks, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  if (cookbooks.length === 1) {
    // No need to pick — one option, just go.
    return (
      <button className="btn primary" onClick={() => onPick(cookbooks[0])}>
        <Icon name="plus" size={14} /> Invite people to {cookbooks[0].name}
      </button>
    );
  }
  return (
    <div className="invite-picker" ref={ref}>
      <button
        type="button"
        className="btn primary"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="plus" size={14} /> Invite people <span className="caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="invite-picker-menu" role="menu">
          <div className="hint">Pick a cookbook</div>
          {cookbooks.map(cb => (
            <button
              key={cb.id}
              type="button"
              role="menuitem"
              className="item"
              onClick={() => { setOpen(false); onPick(cb); }}
            >
              <Icon name="book" size={14} />
              <span>{cb.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Focus-driven typeahead for inviting people while creating a
// cookbook. Behaviour:
//  - Click the field → dropdown reveals every person the cook
//    has shared a cookbook with (their "network").
//  - Type → list filters by name / email substring.
//  - Click a pill → adds them to the invite list.
//  - Press Enter on a freshly-typed email → adds it even if it's
//    not in the network.
// Tighter than the previous "Pick from N people" button + chip
// grid + separate email row, which buried the manual case
// behind a toggle.
// People-picker for invites. Always-visible pills (sorted A→Z)
// instead of a floating dropdown, so the suggestions never get
// clipped by the modal/keyboard on mobile. Free-form email entry
// at the top falls through to addInvite(email) when it parses;
// tapping a pill calls addInvite(email, true).
function NetworkPicker({ networkAvailable, manualEmail, setManualEmail, addInvite, niceName }) {
  const q = manualEmail.trim().toLowerCase();
  const sorted = [...networkAvailable].sort((a, b) =>
    niceName(a).toLowerCase().localeCompare(niceName(b).toLowerCase())
  );
  const filtered = q
    ? sorted.filter(p =>
        p.email?.toLowerCase().includes(q) ||
        p.displayName?.toLowerCase().includes(q) ||
        p.firstName?.toLowerCase().includes(q) ||
        p.lastName?.toLowerCase().includes(q)
      )
    : sorted;
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim());
  const showFreshEmailOption = looksLikeEmail && !networkAvailable.some(p => p.email === manualEmail.trim().toLowerCase());

  const commitFreshEmail = () => {
    if (!looksLikeEmail) return;
    addInvite(manualEmail);
    setManualEmail("");
  };
  const addAll = () => {
    for (const p of filtered) addInvite(p.email, true);
  };

  return (
    <div className="network-picker">
      <input
        type="email"
        className="network-picker-input"
        value={manualEmail}
        onChange={(e) => setManualEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (showFreshEmailOption) commitFreshEmail();
            else if (filtered[0]) { addInvite(filtered[0].email, true); setManualEmail(""); }
          }
        }}
        placeholder="Add by name or email…"
      />
      {(filtered.length > 0 || showFreshEmailOption) && (
        <>
          {networkAvailable.length > 0 && (
            <div className="network-picker-head">
              <span className="label">
                {q ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}` : "People you cook with"}
              </span>
              {filtered.length > 1 && (
                <button type="button" className="link-action" onClick={addAll}>
                  Add all
                </button>
              )}
            </div>
          )}
          <div className="network-picker-pills">
            {filtered.map(p => (
              <button
                key={p.email}
                type="button"
                className="network-pill"
                onClick={() => { addInvite(p.email, true); }}
                title={p.email}
              >
                <Icon name="plus" size={11} />
                <span className="name">{niceName(p)}</span>
              </button>
            ))}
            {showFreshEmailOption && (
              <button
                type="button"
                className="network-pill fresh"
                onClick={commitFreshEmail}
              >
                <Icon name="plus" size={11} />
                <span className="name">Invite {manualEmail.trim()}</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CreateCookbookModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [languages, setLanguages] = useState(["en"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // "Invite people" section — fetches the cook's network
  // (everyone they share a cookbook with) so they can one-tap
  // add familiar faces, and falls through to a manual email
  // input for fresh invites.
  const [network, setNetwork] = useState([]);
  // Each invite is { email, role, fromNetwork }. role defaults
  // to editor (matches the most common case — co-cooks).
  const [invites, setInvites] = useState([]);
  const [manualEmail, setManualEmail] = useState("");
  useEffect(() => {
    fetch("/api/admin/me/network", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.network) setNetwork(data.network); })
      .catch(() => {});
  }, []);
  const addInvite = (email, fromNetwork = false) => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    if (invites.some(i => i.email === e)) return;
    setInvites(prev => [...prev, { email: e, role: "editor", fromNetwork }]);
  };
  const removeInvite = (email) => setInvites(prev => prev.filter(i => i.email !== email));
  const setInviteRole = (email, role) =>
    setInvites(prev => prev.map(i => i.email === email ? { ...i, role } : i));

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
        body: JSON.stringify({ name: n, blurb, visibility, languages }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Create failed (${res.status})`);
      }
      const { cookbook } = await res.json();
      // Fire each invitation. Failures are non-fatal — the
      // cookbook itself is already created; we just log issues
      // and surface them as a soft warning.
      const inviteErrors = [];
      for (const inv of invites) {
        try {
          const r = await fetch(`/api/admin/cookbooks/${cookbook.id}/invitations`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: inv.email, role: inv.role }),
          });
          if (!r.ok) {
            const { error: msg } = await r.json().catch(() => ({}));
            inviteErrors.push(`${inv.email}: ${msg || r.status}`);
          }
        } catch (err) {
          inviteErrors.push(`${inv.email}: ${err.message}`);
        }
      }
      onCreated(cookbook, { inviteCount: invites.length - inviteErrors.length, inviteErrors });
    } catch (err) {
      setError(err.message || "Could not create cookbook.");
    } finally {
      setSaving(false);
    }
  };

  // Filter out network people already invited (or already in the
  // list of suggestions) so the picker doesn't show duplicates.
  const networkAvailable = network.filter(p => !invites.some(i => i.email === p.email));
  const niceName = (p) => p.displayName || [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email;

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
              placeholder="e.g. Smith Family Cookbook, Healthy recipes, Quick and Easy recipes"
              autoFocus
              maxLength={80}
            />
          </label>

          <label className="modal-field">
            <span>Description</span>
            <input
              type="text"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              placeholder="What's this cookbook about?"
              maxLength={280}
            />
          </label>

          <div className="modal-field">
            <span>Languages</span>
            <LanguagePicker value={languages} onChange={setLanguages} />
          </div>

          {/* Invite people inline. The cookbook is created first
              on submit, then each invite fires against the new
              cookbook id. Failures don't block the create. */}
          <div className="modal-field">
            <span>Invite people <span className="opt">(optional)</span></span>
            {invites.length > 0 && (
              <ul className="create-invite-list">
                {invites.map(inv => (
                  <li key={inv.email} className="create-invite-row">
                    <span className="who">{inv.email}</span>
                    <select
                      value={inv.role}
                      onChange={(e) => setInviteRole(inv.email, e.target.value)}
                      className="role-select"
                    >
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button
                      type="button"
                      className="btn ghost icon-only"
                      onClick={() => removeInvite(inv.email)}
                      aria-label="Remove invite"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <NetworkPicker
              networkAvailable={networkAvailable}
              manualEmail={manualEmail}
              setManualEmail={setManualEmail}
              addInvite={addInvite}
              niceName={niceName}
            />
          </div>

          {/* Visibility (private / unlisted / public) is set silently
              to 'private' for now. Sharing happens via explicit
              invites. A future Phase 4c will expose a public
              directory and surface this control. */}

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

// Lightly mask a member's email so it doesn't leak in shared
// cookbook member lists. Owners/editors see the masked form
// ("g***@gmail.com") — only admins see the full address.
function maskEmail(email) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

function MembersSection({ cookbook, authEmail, isAdmin, canRemoveMembers, onMembersChanged }) {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);
  // Network = everyone the cook already shares a cookbook with,
  // used as inline pill suggestions. Filtered against the current
  // members + pending invitations so we don't suggest someone
  // who's already in or already invited.
  const [network, setNetwork] = useState([]);
  useEffect(() => {
    fetch("/api/admin/me/network", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.network) setNetwork(data.network); })
      .catch(() => {});
  }, []);
  const niceName = (p) => p.displayName || [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email;

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

  // Fire a single invitation. Called either by the typed-email
  // form (button submit, copies the link to clipboard for sharing)
  // or by the network-pill picker (auto-copies still, but the
  // expected flow is the recipient gets emailed by the server).
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

  const invite = async (e) => {
    e?.preventDefault?.();
    await sendInvite(inviteEmail, inviteRole);
    setInviteEmail("");
  };

  const revoke = async (token) => {
    try {
      await fetch(`/api/admin/cookbooks/${cookbook.id}/invitations/${token}`, {
        method: "DELETE", credentials: "include",
      });
      setInvitations(prev => prev.filter(i => i.token !== token));
    } catch {}
  };

  const copyLink = async (link, token, inviteEmail) => {
    try {
      await navigator.clipboard.writeText(buildInviteMessage(cookbook.name, inviteEmail, link));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1800);
    } catch {}
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
              <div className="name">{m.displayName || (isAdmin ? m.email : maskEmail(m.email))}</div>
              {m.displayName && <div className="email">{isAdmin ? m.email : maskEmail(m.email)}</div>}
            </div>
            {canRemoveMembers ? (
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
            ) : (
              // Editor / viewer view — read-only role badge so the
              // person can see who's an owner / editor / viewer
              // without being able to change it.
              <span className={`role-badge role-${m.role}`}>{m.role}</span>
            )}
            {canRemoveMembers && (
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
            )}
          </li>
        ))}
      </ul>

      <div className="section-head">Invite someone</div>
      <div className="invite-role-row">
        <label>
          New invites join as
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} disabled={inviting}>
            <option value="editor">editor</option>
            <option value="viewer">viewer</option>
          </select>
        </label>
      </div>
      {(() => {
        // Filter out anyone who's already a member or already has a
        // pending invite for this cookbook, so the suggestion pills
        // can't double-invite.
        const alreadyHere = new Set([
          ...members.map(m => m.email?.toLowerCase()),
          ...invitations.map(i => (i.email || "").toLowerCase()).filter(Boolean),
        ]);
        const available = network.filter(p => !alreadyHere.has(p.email?.toLowerCase()));
        return (
          <NetworkPicker
            networkAvailable={available}
            manualEmail={inviteEmail}
            setManualEmail={setInviteEmail}
            addInvite={(email) => sendInvite(email, inviteRole)}
            niceName={niceName}
          />
        );
      })()}
      <div className="invite-hint">
        Tap a name to send them an invite. Fresh emails land in their inbox; the link's also copied so you can share via text. Expires in 14 days.
      </div>

      {invitations.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 18 }}>Pending invitations</div>
          <ul className="invitations-list">
            {invitations.map(inv => (
              <li key={inv.token} className="invitation-row">
                <div className="who">
                  <div className="name">
                    {inv.email || "Anyone with the link"} <span className="role-tag">{inv.role}</span>
                  </div>
                  <div className="meta">expires {new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                </div>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => copyLink(inv.link, inv.token, inv.email)}
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

export function EditCookbookModal({ cookbook, initialTab, authEmail, isAdmin, onClose, onSaved, onDeleted, onMembersChanged }) {
  // Settings tab + danger zone are owner / admin only — editors
  // see Members tab only (they can invite, can't rename, can't
  // delete). canSettings drives both the tab visibility and the
  // form's read-only state.
  const canSettings = cookbook.yourRole === "owner" || cookbook.yourRole === "admin" || isAdmin;
  const canRemoveMembers = canSettings;
  const [tab, setTab] = useState(initialTab || (canSettings ? "settings" : "members"));
  const [name, setName] = useState(cookbook.name);
  const [blurb, setBlurb] = useState(cookbook.blurb || "");
  const [visibility, setVisibility] = useState(cookbook.visibility);
  const [languages, setLanguages] = useState(
    Array.isArray(cookbook.languages) && cookbook.languages.length ? cookbook.languages : ["en"]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateMsg, setTranslateMsg] = useState(null);

  // Backfill: queue translations for every recipe in this cookbook
  // into every cookbook language that doesn't yet have one. Used
  // after a cookbook adopts a new language so older recipes get
  // caught up without having to re-save each one by hand.
  const translateAll = async () => {
    setTranslating(true);
    setTranslateMsg(null);
    try {
      const res = await fetch(`/api/admin/cookbooks/${cookbook.id}/translate-missing`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Translate failed (${res.status})`);
      setTranslateMsg(data.message || `Queued ${data.queued} recipes for translation.`);
    } catch (err) {
      setTranslateMsg(err.message || "Could not queue translations.");
    } finally {
      setTranslating(false);
    }
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cookbooks/${cookbook.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), blurb, visibility, languages }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Save failed (${res.status})`);
      }
      onSaved({ ...cookbook, name: name.trim(), blurb, visibility, languages });
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
          {canSettings && (
            <button type="button" role="tab" aria-selected={tab === "settings"} className={`tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>Settings</button>
          )}
          <button type="button" role="tab" aria-selected={tab === "members"} className={`tab ${tab === "members" ? "active" : ""}`} onClick={() => setTab("members")}>Members</button>
        </div>

        {tab === "settings" && canSettings && (
          <>
            <form onSubmit={submit}>
              <label className="modal-field">
                <span>Name</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </label>

              <label className="modal-field">
                <span>Description</span>
                <input type="text" value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={280} />
              </label>

              <div className="modal-field">
                <span>Languages</span>
                <LanguagePicker value={languages} onChange={setLanguages} />
                {languages.length > 1 && (
                  <div className="translate-all-row">
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={translateAll}
                      disabled={translating}
                    >
                      {translating ? "Queueing…" : "Translate existing recipes"}
                    </button>
                    {translateMsg && <span className="translate-all-msg">{translateMsg}</span>}
                  </div>
                )}
              </div>

              {/* Visibility hidden for now — kept in the form state so
                  the PATCH still includes it, but no UI until the
                  public-cookbook directory ships (Phase 4c). */}

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
          <MembersSection
            cookbook={cookbook}
            authEmail={authEmail}
            isAdmin={isAdmin}
            canRemoveMembers={canRemoveMembers}
            onMembersChanged={onMembersChanged}
          />
        )}
      </div>
    </div>
  );
}

export function CookbooksIndex({ authEmail, isAdmin, activeCookbookId, onClose, onOpenCookbook }) {
  const [cookbooks, setCookbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  // editing = { cookbook, tab? } so the onboarding banner can
  // open the modal directly on the Members tab.
  const [editing, setEditing] = useState(null);
  // Drag-and-drop reorder state. draggedId tracks the card the
  // cook is dragging; dragOverId paints the drop-target outline.
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
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

  // Persist the cook's new order. Optimistic: reorder local state
  // first, then PUT. On failure we leave the optimistic order in
  // place — a refetch on next mount will reconcile.
  const persistOrder = async (orderedIds) => {
    try {
      await fetch("/api/admin/cookbooks/order", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
    } catch {}
  };

  // "Set as default" — move the chosen cookbook to position 0 of
  // the cook's flat order. Optimistic update; server uses the
  // defaultId shortcut so we don't have to recompute the rest.
  const setAsDefault = async (id) => {
    setCookbooks(prev => {
      const target = prev.find(c => c.id === id);
      if (!target) return prev;
      const rest = prev.filter(c => c.id !== id);
      return [{ ...target, displayOrder: 0 }, ...rest.map((c, i) => ({ ...c, displayOrder: i + 1 }))];
    });
    try {
      await fetch("/api/admin/cookbooks/order", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultId: id }),
      });
    } catch {}
  };

  // Drop handler: move draggedId to the slot of targetId in the
  // flat array, then push the new order to the server.
  const reorder = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setCookbooks(prev => {
      const from = prev.findIndex(c => c.id === sourceId);
      const to = prev.findIndex(c => c.id === targetId);
      if (from < 0 || to < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const ids = next.map(c => c.id);
      persistOrder(ids);
      return next.map((c, i) => ({ ...c, displayOrder: i }));
    });
  };

  return (
    <div className="cookbooks-page" data-screen-label="08 My Cookbooks">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      <div className="cookbooks-header">
        <div className="lhs">
          <div className="eyebrow">Your library</div>
          <h1><em>Cookbooks</em></h1>
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
      {!familyPromptDismissed && cookbooks.length > 0 && (() => {
        // Three states:
        //  - Owns at least one cookbook beyond the personal default
        //    → prompt to invite people. Picker chooses which.
        //  - Member of a family cookbook (owner/editor/viewer)
        //    → no prompt; they're set.
        //  - Not in any family cookbook → prompt to create one.
        const looksLikeFamily = (c) =>
          /family/i.test(c.id) || /Family Cookbook/i.test(c.name);
        const memberOfFamily = cookbooks.some(c =>
          looksLikeFamily(c) && ["owner", "editor", "viewer"].includes(c.yourRole)
        );
        // Cookbooks the cook can meaningfully invite people into
        // = ones where they're explicitly owner OR editor (both
        // can issue invites; only owners can remove or change
        // roles). Excludes:
        //  - "personal-…" / "<Name>'s Cookbook" (solo by design)
        //  - cookbooks they only see via system-admin access —
        //    inviting from someone else's cookbook should happen
        //    through the explicit admin tools, not the onboarding
        //    banner.
        const invitable = cookbooks.filter(c =>
          (c.yourRole === "owner" || c.yourRole === "editor")
          && !/^personal-/i.test(c.id)
          && !/'s Cookbook$/i.test(c.name)
        );

        if (invitable.length > 0) {
          return (
            <div className="onboarding-prompt">
              <div className="t">
                <div className="eyebrow">Get started</div>
                <h3>Invite people to a cookbook</h3>
                <p>Cookbooks shine when they're shared. Pick which one and send an invite link — they'll join as viewer or editor.</p>
              </div>
              <div className="actions">
                <InvitePicker cookbooks={invitable} onPick={(cb) => setEditing({ cookbook: cb, tab: "members" })} />
                <button className="btn ghost sm" onClick={dismissFamilyPrompt}>Dismiss</button>
              </div>
            </div>
          );
        }

        if (!memberOfFamily) {
          return (
            <div className="onboarding-prompt">
              <div className="t">
                <div className="eyebrow">Get started</div>
                <h3>Start a family cookbook</h3>
                <p>You're only in your personal cookbook so far. Make a family cookbook to share recipes with the people you cook with — or wait for an invite from someone who already has one.</p>
              </div>
              <div className="actions">
                <button className="btn primary" onClick={() => setCreateOpen(true)}>
                  <Icon name="plus" size={14} /> Create a family cookbook
                </button>
                <button className="btn ghost sm" onClick={dismissFamilyPrompt}>Dismiss</button>
              </div>
            </div>
          );
        }

        return null;
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
        // Source order is the server's display_order; sectioning
        // preserves that order within each section.
        const owned = cookbooks.filter(c => c.yourRole === "owner");
        const shared = cookbooks.filter(c => c.yourRole === "editor" || c.yourRole === "viewer");
        const adminAccess = cookbooks.filter(c => c.adminAccess || (c.yourRole === "admin" && !c.adminAccess));
        // The default cookbook = whichever sits at position 0 in
        // the cook's flat order. Drives the "Default" badge.
        const defaultId = cookbooks[0]?.id;
        const renderCard = (cb) => {
          const isOwner = cb.yourRole === "owner";
          // Editors get the gear too — it opens the Members tab
          // so they can invite people. Settings tab + danger zone
          // are hidden for them inside the modal.
          const canManage =
            isOwner ||
            cb.yourRole === "editor" ||
            cb.yourRole === "admin";
          // Admin-access cookbooks aren't in cookbook_members for
          // this cook, so the reorder endpoint has nothing to write
          // — disable drag + set-as-default on them.
          const canReorder = !cb.adminAccess;
          const isDefault = cb.id === defaultId;
          return (
            <div
              key={cb.id}
              className={`cookbook-card ${cb.id === activeCookbookId ? "active" : ""} ${draggedId === cb.id ? "dragging" : ""} ${dragOverId === cb.id ? "drag-over" : ""}`}
              draggable={canReorder}
              onDragStart={canReorder ? (e) => {
                setDraggedId(cb.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", cb.id);
              } : undefined}
              onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
              onDragOver={canReorder ? (e) => {
                if (!draggedId || draggedId === cb.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverId !== cb.id) setDragOverId(cb.id);
              } : undefined}
              onDragLeave={() => { if (dragOverId === cb.id) setDragOverId(null); }}
              onDrop={canReorder ? (e) => {
                e.preventDefault();
                reorder(draggedId, cb.id);
                setDraggedId(null);
                setDragOverId(null);
              } : undefined}
            >
              <div className="cookbook-card-head">
                <div className={`role-badge role-${cb.yourRole}`}>
                  {cb.adminAccess ? "admin access" : cb.yourRole}
                </div>
                {isDefault && (
                  <div className="role-badge default-badge" title="Your default cookbook">Default</div>
                )}
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
              {canReorder && !isDefault && (
                <button
                  type="button"
                  className="cookbook-card-default-action"
                  onClick={(e) => { e.stopPropagation(); setAsDefault(cb.id); }}
                  title="Show this cookbook first"
                >
                  Set as default
                </button>
              )}
            </div>
          );
        };
        return (
          <>
            {owned.length > 0 && (
              <section className="cookbook-section">
                <div className="section-head">Your cookbooks</div>
                <div className="cookbooks-grid">{owned.map(renderCard)}</div>
              </section>
            )}
            {shared.length > 0 && (
              <section className="cookbook-section">
                <div className="section-head">Shared with you</div>
                <div className="cookbooks-grid">{shared.map(renderCard)}</div>
              </section>
            )}
            {/* Admin · all cookbooks moved to /admin → "Cookbooks"
                tab so the cookbooks index stays focused on the
                cook's own library. */}
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
          isAdmin={isAdmin}
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

// Admin tab — fetches every cookbook in the system and shows
// them via the searchable AdminCookbookTable. Owners get the
// edit-modal dialog wired in too so admins can rename, manage
// members, or delete from one place.
export function AdminCookbooksTab({ authEmail, activeCookbookId, onOpenCookbook }) {
  const [cookbooks, setCookbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/cookbooks", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { cookbooks: list } = await res.json();
      setCookbooks(list || []);
    } catch (err) {
      setError("Could not load cookbooks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ marginTop: 24, color: "var(--ink-3)" }}>Loading cookbooks…</div>;
  if (error) return <div className="cookbooks-empty" style={{ color: "#933" }}>{error}</div>;

  return (
    <>
      <AdminCookbookTable
        cookbooks={cookbooks}
        activeCookbookId={activeCookbookId}
        authEmail={authEmail}
        onOpenCookbook={onOpenCookbook}
        onEdit={(cb) => setEditing({ cookbook: cb })}
      />
      {editing && (
        <EditCookbookModal
          cookbook={editing.cookbook}
          initialTab={editing.tab || "settings"}
          authEmail={authEmail}
          isAdmin={true}
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
    </>
  );
}
