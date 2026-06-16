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

// Friendly nationality labels for the cover-facing book — used
// on both the cookbook library shelf and the Discover page.
const LANG_NATIONALITY = {
  en: "Canadian",
  enUS: "American",
  pl: "Polish",
  es: "Mexican",
  el: "Greek",
  pt: "Portuguese",
  fil: "Filipino",
};

// Multi-select language picker shared by Create + Edit cookbook
// modals. English is always present and locked; up to two
// additional languages can be toggled on as pills.
// Both en (Canadian) and enUS (American) satisfy the "must have
// English" requirement — a cookbook needs at least one of the
// two, but not both. Toggling between them is allowed.
const ENGLISH_CODES = ["en", "enUS"];
const hasAnyEnglish = (langs) => langs.some(c => ENGLISH_CODES.includes(c));

export function LanguagePicker({ value, onChange }) {
  const selected = Array.isArray(value) && value.length ? value : ["en"];
  const toggle = (code) => {
    if (selected.includes(code)) {
      // Removing — guard against stripping the last English.
      const next = selected.filter(c => c !== code);
      if (ENGLISH_CODES.includes(code) && !hasAnyEnglish(next)) return;
      onChange(next);
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
          // An English variant is "locked" only when it's the
          // last English in the list — i.e. removing it would
          // leave the cookbook with no English. Either Canadian
          // or American satisfies the requirement; flipping
          // between them is fine.
          const isEnglish = ENGLISH_CODES.includes(code);
          const locked = on && isEnglish && !hasAnyEnglish(selected.filter(c => c !== code));
          const disabled = !on && !locked && selected.length >= MAX_COOKBOOK_LANGS;
          return (
            <button
              key={code}
              type="button"
              className={`lang-picker-pill ${on ? "on" : ""} ${locked ? "locked" : ""}`}
              onClick={() => toggle(code)}
              disabled={disabled}
              title={
                locked
                  ? "At least one English variant is required"
                  : disabled
                    ? `Up to ${MAX_COOKBOOK_LANGS} languages`
                    : meta?.label
              }
            >
              {meta?.label || code}
            </button>
          );
        })}
      </div>
      <div className="lang-picker-hint">
        Up to {MAX_COOKBOOK_LANGS} languages. At least one English variant (Canadian or American) is required.
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
export function NetworkPicker({ networkAvailable, manualEmail, setManualEmail, addInvite, niceName }) {
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
                      <option value="viewer">follower</option>
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

export function MembersSection({ cookbook, authEmail, isAdmin, canRemoveMembers, onMembersChanged }) {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);
  // Deferred role changes — staged in this map until the cook
  // clicks the "Save changes" button. Email → new role.
  const [pendingRoles, setPendingRoles] = useState({});
  const [savingRoles, setSavingRoles] = useState(false);
  // Inline confirmation that auto-dismisses, mimics the global
  // snackbar pattern but locally scoped to this surface so the
  // confirmation lands next to the action.
  const [toast, setToast] = useState(null);
  const flashToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };
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

  // Stage a role change. Persists into pendingRoles until the
  // cook clicks "Save changes".
  const stageRole = (email, role) => {
    setPendingRoles(prev => {
      const next = { ...prev };
      const original = members.find(m => m.email === email)?.role;
      if (original === role) {
        delete next[email];
      } else {
        next[email] = role;
      }
      return next;
    });
  };

  // Commit every staged role change in one go. Errors keep the
  // pending map intact so the cook can retry; successful saves
  // clear it and surface an inline confirmation.
  const saveRoles = async () => {
    const entries = Object.entries(pendingRoles);
    if (entries.length === 0) return;
    setSavingRoles(true);
    setError(null);
    const failed = [];
    for (const [email, role] of entries) {
      try {
        const res = await fetch(`/api/admin/cookbooks/${cookbook.id}/members/${encodeURIComponent(email)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({}));
          failed.push({ email, msg: msg || `HTTP ${res.status}` });
          continue;
        }
        setMembers(prev => prev.map(m => m.email === email ? { ...m, role } : m));
      } catch (err) {
        failed.push({ email, msg: err.message });
      }
    }
    setSavingRoles(false);
    if (failed.length) {
      setError(`Couldn't update ${failed.map(f => `${f.email} (${f.msg})`).join(", ")}.`);
      // Drop only the successful ones from pendingRoles.
      setPendingRoles(prev => {
        const next = {};
        for (const { email } of failed) {
          if (prev[email] != null) next[email] = prev[email];
        }
        return next;
      });
    } else {
      setPendingRoles({});
      flashToast(entries.length === 1 ? "Role updated" : `${entries.length} roles updated`);
      onMembersChanged?.();
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

  // Friendly avatar initials: first letter of first + last name when
  // both exist, else first two letters of the display name / email
  // local-part.
  const initialsFor = (m) => {
    const first = (m.firstName || "").trim();
    const last = (m.lastName || "").trim();
    if (first && last) return (first[0] + last[0]).toUpperCase();
    const name = m.displayName || (m.email ? m.email.split("@")[0] : "");
    return (name.slice(0, 2) || "?").toUpperCase();
  };
  const displayNameFor = (m) =>
    m.displayName || [m.firstName, m.lastName].filter(Boolean).join(" ") || (m.email || "").split("@")[0];

  const activeCount = members.length;
  const invitedCount = invitations.length;

  // Filter network down to people not already a member or already
  // invited, so the suggestion pills can't double-invite.
  const alreadyHere = new Set([
    ...members.map(m => m.email?.toLowerCase()),
    ...invitations.map(i => (i.email || "").toLowerCase()).filter(Boolean),
  ]);
  const availableNetwork = network.filter(p => !alreadyHere.has(p.email?.toLowerCase()));

  return (
    <div className="cb-members">
      <div className="cb-members-head">
        <div>
          <div className="eyebrow">Who's in the kitchen</div>
          <h1>Members <em>&amp;</em> permissions</h1>
        </div>
        <div className="cb-members-count">
          {activeCount} active{invitedCount > 0 ? ` · ${invitedCount} invited` : ""}
        </div>
      </div>

      {error && <div className="modal-error">{error}</div>}

      {/* Active members + pending invites in one card */}
      <div className="cb-card cb-members-card">
        <ul className="cb-members-list">
          {members.map(m => {
            const isYou = m.email === authEmail;
            const isSelfOwner = isYou && m.role === "owner";
            const currentRole = pendingRoles[m.email] ?? m.role;
            const hasPending = pendingRoles[m.email] != null;
            const onMemberSelect = (e) => {
              const v = e.target.value;
              if (v === "__remove__") {
                e.target.value = currentRole;
                const name = displayNameFor(m);
                if (window.confirm(`Are you sure you want to remove ${name} from this cookbook?`)) {
                  fetch(`/api/admin/cookbooks/${cookbook.id}/members/${encodeURIComponent(m.email)}`, {
                    method: "DELETE", credentials: "include",
                  }).then(async r => {
                    if (!r.ok) {
                      const { error: msg } = await r.json().catch(() => ({}));
                      setError(msg || "Could not remove member");
                      return;
                    }
                    setMembers(prev => prev.filter(x => x.email !== m.email));
                    setPendingRoles(prev => { const next = { ...prev }; delete next[m.email]; return next; });
                    flashToast(`${displayNameFor(m)} removed`);
                    onMembersChanged?.();
                  }).catch(err => setError(err.message));
                }
                return;
              }
              stageRole(m.email, v);
            };
            return (
              <li key={m.email} className={`cb-member-row ${hasPending ? "pending" : ""}`}>
                <div className="avatar">{initialsFor(m)}</div>
                <div className="who">
                  <div className="name">
                    {displayNameFor(m)}
                    {isYou && <span className="you-tag">· YOU</span>}
                    {hasPending && <span className="pending-tag">· UNSAVED</span>}
                  </div>
                  <div className="email">{isAdmin ? m.email : maskEmail(m.email)}</div>
                </div>
                {canRemoveMembers ? (
                  <select
                    className="cb-role-select"
                    value={currentRole}
                    onChange={onMemberSelect}
                    disabled={isSelfOwner}
                    title={isSelfOwner ? "Promote someone else first to demote yourself" : "Change role"}
                  >
                    <option value="owner">Owner</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Follower</option>
                    <option value="__remove__" disabled={isSelfOwner}>Remove…</option>
                  </select>
                ) : (
                  <span className="role-fixed">{currentRole === "viewer" ? "Follower" : (currentRole.charAt(0).toUpperCase() + currentRole.slice(1))}</span>
                )}
              </li>
            );
          })}
          {invitations.map(inv => (
            <li key={inv.token} className="cb-member-row invited">
              <div className="avatar invited">{(inv.email || "?").slice(0, 2).toUpperCase()}</div>
              <div className="who">
                <div className="name">{inv.email || "Anyone with the link"}</div>
                <div className="email">
                  Expires {new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
              <span className="cb-invited-pill" title="Invitation pending">
                <Icon name="send" size={11} />
                <span className="cb-invited-text">INVITED</span>
              </span>
              <button
                type="button"
                className="cb-copy-link-btn"
                onClick={() => copyLink(inv.link, inv.token, inv.email)}
                title={copiedToken === inv.token ? "Copied!" : "Copy invite link"}
              >
                <Icon name={copiedToken === inv.token ? "check" : "share"} size={13} />
                <span className="cb-copy-link-text">{copiedToken === inv.token ? "Copied" : "Copy link"}</span>
              </button>
              <select
                className="cb-role-select"
                defaultValue={inv.role}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__copy__") {
                    e.target.value = inv.role;
                    copyLink(inv.link, inv.token, inv.email);
                  } else if (v === "__remove__") {
                    e.target.value = inv.role;
                    if (window.confirm(`Are you sure you want to revoke this invitation?`)) {
                      revoke(inv.token);
                    }
                  }
                }}
              >
                <option value="viewer" disabled>Follower</option>
                <option value="editor" disabled>Editor</option>
                <option value="__copy__">{copiedToken === inv.token ? "Copied!" : "Copy link"}</option>
                {canRemoveMembers && <option value="__remove__">Remove…</option>}
              </select>
            </li>
          ))}
        </ul>
        {(Object.keys(pendingRoles).length > 0 || toast) && (
          <div className="cb-members-actions">
            {toast && <div className="cb-members-toast"><Icon name="check" size={13} /> {toast}</div>}
            {Object.keys(pendingRoles).length > 0 && (
              <button
                type="button"
                className="btn primary"
                onClick={saveRoles}
                disabled={savingRoles}
              >
                <Icon name="check" size={14} />
                {savingRoles
                  ? "Saving…"
                  : `Save ${Object.keys(pendingRoles).length} ${Object.keys(pendingRoles).length === 1 ? "change" : "changes"}`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Role explainer */}
      <div className="cb-card cb-roles-card">
        <div className="cb-card-title">What each role can do</div>
        <ul className="cb-roles-list">
          <li>
            <span className="role-badge role-owner">owner</span>
            <span>Full control — recipes, members, languages, settings, and deleting the cookbook.</span>
          </li>
          <li>
            <span className="role-badge role-editor">editor</span>
            <span>Add, edit, and remove recipes, and invite new cooks.</span>
          </li>
          <li>
            <span className="role-badge role-viewer">follower</span>
            <span>Read, cook from, and comment on recipes.</span>
          </li>
        </ul>
      </div>

      {/* Invite by email — text input + role select + Send.
          Below the row, network pill suggestions from people the
          cook already shares a cookbook with. */}
      <div className="cb-card cb-invite-card">
        <div className="cb-card-title">Invite by email</div>
        <div className="cb-card-desc">
          They'll get an invitation to join "{cookbook.name}". For now, the directory is invite-only.
        </div>
        <form className="cb-invite-row" onSubmit={invite}>
          <input
            type="email"
            placeholder="name@email.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="cb-invite-input"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            disabled={inviting}
            className="cb-invite-role"
          >
            {canRemoveMembers && <option value="owner">As owner</option>}
            <option value="editor">As editor</option>
            <option value="viewer">As follower</option>
          </select>
          <button type="submit" className="btn primary" disabled={inviting}>
            <Icon name="plus" size={13} /> Send invite
          </button>
        </form>
        {availableNetwork.length > 0 && (
          <div className="cb-network-pills">
            <div className="cb-network-pills-label">People you cook with</div>
            <NetworkPicker
              networkAvailable={availableNetwork}
              manualEmail={inviteEmail}
              setManualEmail={setInviteEmail}
              addInvite={(email) => sendInvite(email, inviteRole)}
              niceName={niceName}
            />
          </div>
        )}
      </div>
    </div>
  );
}


// Reusable settings form for a cookbook. Renders the same form
// EditCookbookModal used to render in its Settings tab, so the
// inline "Settings" tab on the new /cookbook/<slug> page and the
// legacy edit modal share the exact same fields + danger zone.
// Caller owns onSaved/onDeleted/onCancel + the surrounding
// chrome (modal vs. tab).
// Curated swatch palette for the book cover. Keep them dark-
// enough that the white serif title + bookmark stay legible.
export const COVER_COLORS = [
  { value: "#6e7a3a", label: "Olive" },
  { value: "#3f5a6e", label: "Slate" },
  { value: "#b04a2a", label: "Brick" },
  { value: "#4f3b2c", label: "Walnut" },
  { value: "#5e3a52", label: "Plum" },
  { value: "#2c5e4f", label: "Pine" },
  { value: "#8a6b35", label: "Mustard" },
  { value: "#3a3a3a", label: "Graphite" },
  { value: "#a8456b", label: "Rose" },
];

export function CookbookSettingsForm({ cookbook, isAdmin, onSaved, onDeleted, onCancel }) {
  const canSettings = cookbook.yourRole === "owner" || cookbook.yourRole === "admin" || isAdmin;
  const [name, setName] = useState(cookbook.name);
  const [blurb, setBlurb] = useState(cookbook.blurb || "");
  const [visibility, setVisibility] = useState(cookbook.visibility);
  const [coverPhoto, setCoverPhoto] = useState(cookbook.coverPhoto || null);
  const [coverColor, setCoverColor] = useState(cookbook.coverColor || null);
  const [cookbookType, setCookbookType] = useState(cookbook.cookbookType || "");
  const [allowComments, setAllowComments] = useState(true);
  // Track the language set the cook landed on so we can show
  // "Translate existing recipes" only when they've actually
  // changed the language set — and hide it again if they revert
  // back to the saved value.
  const initialLanguages = Array.isArray(cookbook.languages) && cookbook.languages.length ? cookbook.languages : ["en"];
  const [languages, setLanguages] = useState(initialLanguages);
  const languagesDirty = JSON.stringify([...languages].sort()) !== JSON.stringify([...initialLanguages].sort());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateMsg, setTranslateMsg] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [isDefault, setIsDefault] = useState((cookbook.displayOrder ?? 99999) === 0);
  const [makingDefault, setMakingDefault] = useState(false);

  const makeDefault = async () => {
    setMakingDefault(true);
    try {
      const res = await fetch("/api/admin/cookbooks/order", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultId: cookbook.id }),
      });
      if (res.ok) setIsDefault(true);
    } catch {} finally {
      setMakingDefault(false);
    }
  };

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

  // Upload + immediately persist the new cover. The cookbook
  // header on the page reads cookbook.coverPhoto, so saving
  // straight away (instead of waiting for the "Save changes"
  // submit) lets the cover panel update live.
  const uploadCover = async (file) => {
    if (!file) return;
    setUploadingCover(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/admin/uploads", { method: "POST", credentials: "include", body: fd });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);
      const { url } = await up.json();
      setCoverPhoto(url);
      // Persist immediately so the cookbook header refreshes.
      const patch = await fetch(`/api/admin/cookbooks/${cookbook.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverPhoto: url }),
      });
      if (patch.ok) onSaved?.({ ...cookbook, coverPhoto: url });
    } catch (err) {
      setError(err.message || "Could not upload photo.");
    } finally {
      setUploadingCover(false);
    }
  };
  const clearCover = async () => {
    setCoverPhoto(null);
    try {
      const patch = await fetch(`/api/admin/cookbooks/${cookbook.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverPhoto: null }),
      });
      if (patch.ok) onSaved?.({ ...cookbook, coverPhoto: null });
    } catch {}
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
        body: JSON.stringify({ name: name.trim(), blurb, visibility, languages, coverPhoto, coverColor, cookbookType: cookbookType || null }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Save failed (${res.status})`);
      }
      onSaved?.({ ...cookbook, name: name.trim(), blurb, visibility, languages, coverPhoto, coverColor });
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
      onDeleted?.(cookbook.id);
    } catch (err) {
      setError(err.message || "Could not delete cookbook.");
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  if (!canSettings) {
    return <div className="modal-error">Only the owner can change settings.</div>;
  }

  return (
    <form className="cb-settings" onSubmit={submit}>
      <div className="cb-members-head">
        <div>
          <div className="eyebrow">Cookbook settings</div>
          <h1>Details <em>&amp;</em> languages</h1>
        </div>
      </div>

      {/* Card 1: identity (name + description) — labels stack
          on top of inputs so long names / descriptions can use
          the full card width on mobile. */}
      <div className="cb-card">
        <div className="cb-field-stack">
          <label className="cb-field-label" htmlFor="cb-name">
            Cookbook name
            <span className="cb-field-count">{name.length}/50</span>
          </label>
          <input
            id="cb-name"
            type="text"
            className="cb-field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
          />
        </div>
        <div className="cb-field-stack">
          <label className="cb-field-label" htmlFor="cb-blurb">
            Description
            <span className="cb-field-count">{blurb.length}/150</span>
          </label>
          <textarea
            id="cb-blurb"
            className="cb-field-input cb-field-textarea"
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            maxLength={150}
            rows={3}
          />
        </div>
        <div className="cb-field">
          <label htmlFor="cb-type">Cookbook type</label>
          <select
            id="cb-type"
            className="cb-field-input"
            value={cookbookType}
            onChange={(e) => setCookbookType(e.target.value)}
          >
            <option value="">— Not set —</option>
            <option value="family-heirloom">Family heirloom cookbook</option>
            <option value="personal">Personal cookbook</option>
            <option value="group">Group cookbook</option>
          </select>
        </div>
      </div>

      {/* Card 2: languages — translate-existing button follows
          the pills and only shows when the cook has changed the
          language set from what's saved. If they revert back to
          the original, the button disappears again. */}
      <div className="cb-card">
        <div className="cb-card-title">Languages</div>
        <div className="cb-card-desc">The languages this cookbook is kept in. Add one and we can translate the existing recipes into it.</div>
        <LanguagePicker value={languages} onChange={setLanguages} />
        {languagesDirty && languages.length > 1 && (
          <div className="translate-all-row">
            <button type="button" className="btn ghost sm" onClick={translateAll} disabled={translating}>
              {translating ? "Queueing…" : "Translate existing recipes"}
            </button>
            {translateMsg && <span className="translate-all-msg">{translateMsg}</span>}
          </div>
        )}
      </div>

      {/* Card 3: cover colour / cover photo / visibility / directory / comments / delete */}
      <div className="cb-card cb-rows-card">
        <div className="cb-setting-row cb-setting-row--stack-mobile">
          <div className="cb-setting-text">
            <div className="cb-setting-label">Cover colour</div>
            <div className="cb-setting-desc">The cloth colour of the book when there's no cover photo.</div>
          </div>
          <div className="cb-setting-control">
            <div className="cb-color-swatches" role="radiogroup" aria-label="Cover colour">
              {COVER_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={coverColor === c.value}
                  className={`cb-color-swatch ${coverColor === c.value ? "active" : ""}`}
                  style={{ background: c.value }}
                  onClick={() => setCoverColor(c.value)}
                  title={c.label}
                />
              ))}
              <label
                className={`cb-color-swatch custom ${coverColor && !COVER_COLORS.some(c => c.value === coverColor) ? "active" : ""}`}
                title="Pick a custom colour"
                style={coverColor && !COVER_COLORS.some(c => c.value === coverColor) ? { background: coverColor } : undefined}
              >
                <Icon name="plus" size={11} />
                <input
                  type="color"
                  value={coverColor && !COVER_COLORS.some(c => c.value === coverColor) ? coverColor : "#7a3a52"}
                  onChange={(e) => setCoverColor(e.target.value)}
                />
              </label>
              {coverColor && (
                <button
                  type="button"
                  className="cb-color-swatch reset"
                  onClick={() => setCoverColor(null)}
                  title="Reset to default"
                >
                  <Icon name="x" size={11} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="cb-setting-row">
          <div className="cb-setting-text">
            <div className="cb-setting-label">Cover photo</div>
            <div className="cb-setting-desc">Add a family photo and it becomes the cookbook's cover. Without one, the book shows its cloth cover.</div>
          </div>
          <div className="cb-setting-control">
            <label className="btn ghost" style={{ cursor: uploadingCover ? "wait" : "pointer" }}>
              <Icon name="camera" size={14} /> {uploadingCover ? "Uploading…" : (coverPhoto ? "Replace photo" : "Upload photo")}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={uploadingCover}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); e.target.value = ""; }}
              />
            </label>
            {coverPhoto && (
              <button type="button" className="btn ghost icon-only" onClick={clearCover} title="Clear photo">
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="cb-setting-row cb-setting-row--stack-mobile">
          <div className="cb-setting-text">
            <div className="cb-setting-label">Who can see this cookbook</div>
            <div className="cb-setting-desc">Private cookbooks are visible only to members. Public cookbooks appear in the directory and can be followed by anyone.</div>
          </div>
          <div className="cb-setting-control">
            <div className="cb-vis-toggle" role="group" aria-label="Visibility">
              <button
                type="button"
                className={`cb-vis-btn ${visibility === "private" ? "active" : ""}`}
                onClick={() => setVisibility("private")}
              >
                <Icon name="bookmark" size={13} /> Private
              </button>
              <button
                type="button"
                className={`cb-vis-btn ${visibility === "public" ? "active" : ""}`}
                onClick={() => setVisibility("public")}
              >
                <Icon name="share" size={13} /> Public
              </button>
            </div>
          </div>
        </div>

        <div className="cb-setting-row">
          <div className="cb-setting-text">
            <div className="cb-setting-label">Allow comments from followers</div>
            <div className="cb-setting-desc">People who follow this cookbook can leave notes on recipes they've cooked.</div>
          </div>
          <div className="cb-setting-control">
            <button
              type="button"
              role="switch"
              aria-checked={allowComments}
              className={`cb-switch ${allowComments ? "on" : ""}`}
              onClick={() => setAllowComments(v => !v)}
            >
              <span className="knob" />
            </button>
          </div>
        </div>

        <div className="cb-setting-row">
          <div className="cb-setting-text">
            <div className="cb-setting-label">Default cookbook</div>
            <div className="cb-setting-desc">The cookbook that opens first when you sign in and sits cover-facing on your shelf.</div>
          </div>
          <div className="cb-setting-control">
            {isDefault ? (
              <span className="cb-default-badge">Default</span>
            ) : (
              <button type="button" className="btn ghost sm" onClick={makeDefault} disabled={makingDefault}>
                {makingDefault ? "Setting…" : "Make default"}
              </button>
            )}
          </div>
        </div>

        {cookbook.id !== "family-cookbook" && (
          <div className="cb-setting-row danger">
            <div className="cb-setting-text">
              <div className="cb-setting-label">Delete this cookbook</div>
              <div className="cb-setting-desc">Permanently removes the cookbook and its recipes for everyone. This can't be undone.</div>
            </div>
            <div className="cb-setting-control">
              {confirmDelete ? (
                <div className="cb-delete-confirm">
                  <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button type="button" className="btn danger sm" onClick={doDelete} disabled={saving}>
                    {saving ? "Deleting…" : "Confirm delete"}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn ghost danger-link" onClick={() => setConfirmDelete(true)}>
                  Delete…
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <div className="modal-error">{error}</div>}

      <div className="cb-settings-actions">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        )}
        <button type="submit" className="btn primary" disabled={saving || !name.trim()}>
          <Icon name="check" size={14} /> {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
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

export function CookbooksIndex({ authEmail, isAdmin, activeCookbookId, onClose, onOpenCookbook, onOpenCreateCookbook }) {
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
  // Touch reorder shim — HTML5 drag events don't fire on touch.
  // A long-press (260ms without movement) flips into drag mode;
  // touchmove then walks the page with elementFromPoint, and
  // touchend drops onto whichever book is under the finger. The
  // ref-based bookkeeping (not state) keeps the timer + last
  // target stable across re-renders inside the handlers.
  const touchDragRef = useRef({ id: null, longPressTimer: null, suppressClick: false });
  // While a book is mid-drag, lock the body so the page can't
  // scroll out from under the finger. React's onTouchMove is
  // passive so preventDefault() inside the handler is a no-op.
  useEffect(() => {
    if (!draggedId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [draggedId]);
  const cancelTouchDrag = () => {
    const t = touchDragRef.current;
    if (t.longPressTimer) { clearTimeout(t.longPressTimer); t.longPressTimer = null; }
    t.id = null;
    setDraggedId(null);
    setDragOverId(null);
  };
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

      <div className="cookbooks-header">
        <div className="lhs">
          <div className="eyebrow">Your library</div>
          <h1><em>Cookbooks</em> on the shelf</h1>
          <div className="intro">
            The cookbooks you own and the ones you've been invited to.
          </div>
        </div>
        {authEmail && (
          <button className="btn primary" onClick={() => onOpenCreateCookbook ? onOpenCreateCookbook() : setCreateOpen(true)}>
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
                <p>Cookbooks shine when they're shared. Pick which one and send an invite link — they'll join as follower or editor.</p>
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
                <button className="btn primary" onClick={() => onOpenCreateCookbook ? onOpenCreateCookbook() : setCreateOpen(true)}>
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
        // Top shelf = cookbooks the cook owns or edits (book-spine
        // cookbooks). Bottom shelf = cookbooks they only view or
        // follow. Admin-access cookbooks live in the admin panel,
        // not on the cook's personal shelf.
        const topShelf = cookbooks.filter(c => c.yourRole === "owner" || c.yourRole === "editor");
        const bottomShelf = cookbooks.filter(c => c.yourRole === "viewer");
        // The default cookbook = whichever sits at position 0 in
        // the cook's flat order. Renders cover-facing at the
        // front of the top shelf.
        const defaultId = cookbooks[0]?.id;
        // Strip emoji + symbols from a name when computing spine
        // labels so the spine reads as letters, not flame emoji.
        const stripEmoji = (s) =>
          (s || "")
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}️]/gu, "")
            .replace(/\s+/g, " ")
            .trim();
        const coverInitials = (name) => stripEmoji(name)
          .split(/\s+/)
          .filter(w => w && !/^(the|a|an|of|&|and)$/i.test(w))
          .map(w => w.replace(/['']s$/i, "")[0] || "")
          .filter(c => /[A-Za-z]/.test(c))
          .join("")
          .slice(0, 4)
          .toUpperCase();

        const renderBook = (cb, { coverFacing = false } = {}) => {
          const canManage =
            cb.yourRole === "owner" ||
            cb.yourRole === "editor" ||
            cb.yourRole === "admin";
          const canReorder = !cb.adminAccess;
          const isDefault = cb.id === defaultId;
          const role = cb.yourRole || "viewer";
          const isActive = cb.id === activeCookbookId;
          const cssColor = cb.coverColor ? { "--book-color": cb.coverColor } : undefined;
          // Spine thickness scales with recipe count (busy cookbook
          // reads as fatter); height is a stable pseudo-random
          // value derived from the cookbook id so each spine on
          // the shelf has a slightly different stature — like a
          // real shelf where books vary in height — but a given
          // cookbook always renders the same height.
          const recipeCount = cb.recipeCount || 0;
          const thickness = Math.round(42 + Math.min(recipeCount, 120) * 0.4); // 42 – 90px
          const idHash = (cb.id || "").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
          const spineHeight = 250 + (idHash % 72); // 250 – 321px, deterministic
          const bookStyle = coverFacing
            ? cssColor
            : { ...(cssColor || {}), width: `${thickness}px`, height: `${spineHeight}px` };
          const cardClass = [
            "book",
            coverFacing ? "book-cover" : "book-spine",
            isActive ? "active" : "",
            isDefault ? "is-default" : "",
            draggedId === cb.id ? "dragging" : "",
            dragOverId === cb.id ? "drag-over" : "",
          ].filter(Boolean).join(" ");
          const dragHandlers = canReorder ? {
            draggable: true,
            onDragStart: (e) => {
              setDraggedId(cb.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", cb.id);
            },
            onDragEnd: () => { setDraggedId(null); setDragOverId(null); },
            onDragOver: (e) => {
              if (!draggedId || draggedId === cb.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverId !== cb.id) setDragOverId(cb.id);
            },
            onDragLeave: () => { if (dragOverId === cb.id) setDragOverId(null); },
            onDrop: (e) => {
              e.preventDefault();
              reorder(draggedId, cb.id);
              setDraggedId(null);
              setDragOverId(null);
            },
            onTouchStart: (e) => {
              if (e.touches.length !== 1) return;
              const tch = e.touches[0];
              touchDragRef.current.suppressClick = false;
              touchDragRef.current.startX = tch.clientX;
              touchDragRef.current.startY = tch.clientY;
              // 600ms long-press threshold — short enough to feel
              // intentional, long enough that a regular tap that
              // lingers a beat still resolves as a click.
              touchDragRef.current.longPressTimer = setTimeout(() => {
                touchDragRef.current.id = cb.id;
                touchDragRef.current.suppressClick = true;
                setDraggedId(cb.id);
                if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
              }, 600);
            },
            onTouchMove: (e) => {
              const t = touchDragRef.current;
              if (!t.id) {
                // Cancel the pending drag if the finger moves
                // more than 12px — that's a scroll, not a press.
                const tch = e.touches[0];
                const dx = Math.abs(tch.clientX - (t.startX || 0));
                const dy = Math.abs(tch.clientY - (t.startY || 0));
                if (dx > 12 || dy > 12) {
                  if (t.longPressTimer) { clearTimeout(t.longPressTimer); t.longPressTimer = null; }
                }
                return;
              }
              e.preventDefault();
              const touch = e.touches[0];
              const el = document.elementFromPoint(touch.clientX, touch.clientY);
              const bookEl = el?.closest?.(".book");
              const overId = bookEl?.getAttribute("data-book-id");
              if (overId && overId !== t.id && overId !== dragOverId) setDragOverId(overId);
              else if (!overId && dragOverId) setDragOverId(null);
            },
            onTouchEnd: () => {
              const t = touchDragRef.current;
              if (t.longPressTimer) { clearTimeout(t.longPressTimer); t.longPressTimer = null; }
              if (t.id && dragOverId && dragOverId !== t.id) reorder(t.id, dragOverId);
              t.id = null;
              setDraggedId(null);
              setDragOverId(null);
            },
            onTouchCancel: cancelTouchDrag,
            onClickCapture: (e) => {
              if (touchDragRef.current.suppressClick) {
                e.stopPropagation();
                e.preventDefault();
                touchDragRef.current.suppressClick = false;
              }
            },
          } : {};
          return (
            <div key={cb.id} data-book-id={cb.id} className={cardClass} style={bookStyle}>
              {coverFacing ? (
                <button
                  type="button"
                  className="book-cover-body"
                  onClick={() => onOpenCookbook?.(cb)}
                  title={cb.name}
                  {...dragHandlers}
                >
                  {cb.coverPhoto && <img className="book-cover-photo" src={cb.coverPhoto} alt="" />}
                  <span className={`book-bookmark role-${role}`}>{cb.adminAccess ? "admin" : role}</span>
                  <span className="book-cover-content">
                    {(cb.languages?.length || 0) > 0 && (
                      <span className="book-cover-langs">
                        {(cb.languages || ["en"]).map(c => LANG_NATIONALITY[c] || c).join(" · ")}
                      </span>
                    )}
                    <span className="book-cover-title">{stripEmoji(cb.name)}</span>
                    {cb.blurb && (
                      <span className="book-cover-blurb">{cb.blurb}</span>
                    )}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="book-spine-body"
                  onClick={() => onOpenCookbook?.(cb)}
                  title={cb.name}
                  {...dragHandlers}
                >
                  {cb.coverPhoto && <img className="book-spine-photo" src={cb.coverPhoto} alt="" />}
                  <span className="book-spine-label">{stripEmoji(cb.name)}</span>
                </button>
              )}
            </div>
          );
        };

        const defaultCookbook = topShelf.find(c => c.id === defaultId);
        const restOfTop = topShelf.filter(c => c.id !== defaultId);
        return (
          <>
            <section className="shelf-section">
              <div className="shelf-section-head">Your cookbooks</div>
              <div className="shelf">
                {defaultCookbook && renderBook(defaultCookbook, { coverFacing: true })}
                {restOfTop.map(cb => renderBook(cb))}
                <button
                  type="button"
                  className="book book-new"
                  onClick={() => onOpenCreateCookbook ? onOpenCreateCookbook() : setCreateOpen(true)}
                  title="Add a new cookbook"
                >
                  <span className="book-new-icon"><Icon name="plus" size={18} /></span>
                  <span className="book-new-label">Add new cookbook</span>
                </button>
              </div>
            </section>

            {bottomShelf.length > 0 && (
              <section className="shelf-section">
                <div className="shelf-section-head">Following</div>
                <div className="shelf">
                  {bottomShelf.map(cb => renderBook(cb))}
                </div>
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
export function AdminCookbooksTab({ authEmail, activeCookbookId, onOpenCookbook, onEditCookbook }) {
  const [cookbooks, setCookbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    <AdminCookbookTable
      cookbooks={cookbooks}
      activeCookbookId={activeCookbookId}
      authEmail={authEmail}
      onOpenCookbook={onOpenCookbook}
      onEdit={(cb) => onEditCookbook?.(cb)}
    />
  );
}
