// Account settings — edit profile + delete account.
//
// Phase 4b-5: gives every cook (including Patricia) a way to
// update first/last name + phone post-sign-up, and a self-serve
// account deletion that cascades through their owned cookbooks,
// memberships, favorites, lab experiments, prefs, etc. Refuses
// deletion if the cook still owns the historical bootstrap
// family cookbook — they have to transfer it first.

import { useEffect, useState } from "react";
import { Icon, SIGN_OUT_URL } from "./helpers.jsx";
import { AdminAIUsage } from "./admin-ai-usage.jsx";
import { AdminCookbooksTab } from "./cookbooks.jsx";

export function AccountSettings({ profile, refreshProfile, onClose, saveProfile }) {
  const [firstName, setFirstName] = useState(profile?.firstName || "");
  const [lastName, setLastName] = useState(profile?.lastName || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const save = async (e) => {
    e?.preventDefault?.();
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      setError(err.message || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/admin/me/account", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Could not delete account (${res.status}).`);
      }
      // Sign out + bounce. Cloudflare Access keeps a session
      // cookie; logging out ends it cleanly so the next visit
      // looks like a fresh sign-in.
      window.location.href = SIGN_OUT_URL;
    } catch (err) {
      setDeleteError(err.message || "Could not delete account.");
      setDeleting(false);
    }
  };

  return (
    <div className="settings-page" data-screen-label="11 Account settings">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      <div className="settings-header">
        <div className="eyebrow">Your account</div>
        <h1>Account <em>settings</em></h1>
        <div className="intro">
          Update your name and phone, or close your account.
        </div>
      </div>

      <section className="settings-section">
        <div className="section-head">Profile</div>
        <form onSubmit={save} className="settings-form">
          <div className="row">
            <label className="field">
              <span>First name</span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
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
                maxLength={60}
                autoComplete="family-name"
              />
            </label>
          </div>

          <label className="field">
            <span>Phone <span className="opt">(optional)</span></span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={32}
              autoComplete="tel"
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input type="email" value={profile?.email || ""} disabled />
            <span className="hint">Email is set by your sign-in method and can't be changed here.</span>
          </label>

          {error && <div className="settings-error">{error}</div>}

          <div className="actions">
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            {savedAt && <span className="saved-tag">Saved.</span>}
          </div>
        </form>
      </section>

      <section className="settings-section danger">
        <div className="section-head">Danger zone</div>
        {confirmDelete ? (
          <div className="danger-actions">
            <p>
              Deleting your account removes every cookbook you own (and their recipes),
              your memberships in shared cookbooks, your favorites, your Lab experiments,
              and your cooking preferences. <strong>This can't be undone.</strong>
            </p>
            <p>
              Type <code>DELETE</code> to confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="confirm-input"
            />
            {deleteError && <div className="settings-error">{deleteError}</div>}
            <div className="actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => { setConfirmDelete(false); setConfirmText(""); setDeleteError(null); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={doDelete}
                disabled={confirmText !== "DELETE" || deleting}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p>Permanently close your account and erase your data.</p>
            <button
              type="button"
              className="btn ghost danger-link"
              onClick={() => setConfirmDelete(true)}
            >
              Delete my account
            </button>
          </>
        )}
      </section>
    </div>
  );
}

// Edit-user modal: admin can change first/last name, phone,
// approval status, admin flag, or delete the account.
function EditUserModal({ user, onClose, onSaved, onDeleted }) {
  const [firstName, setFirstName] = useState(user.firstName || "");
  const [lastName, setLastName] = useState(user.lastName || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [status, setStatus] = useState(user.status || "approved");
  const [makeAdmin, setMakeAdmin] = useState(!!user.isAdmin);
  const [simpleMode, setSimpleMode] = useState(!!user.simpleMode);
  const [lang, setLang] = useState(user.lang || "en");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async (e) => {
    e?.preventDefault?.();
    setSaving(true); setError(null);
    try {
      const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          displayName,
          status,
          isAdmin: makeAdmin,
          simpleMode,
          lang,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Save failed (${res.status})`);
      }
      onSaved({
        ...user,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        displayName,
        status,
        isAdmin: makeAdmin,
        simpleMode,
        lang,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || "Could not delete account.");
      }
      onDeleted(user.email);
    } catch (err) {
      setError(err.message);
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cookbook-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit user">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
        <div className="eyebrow">User settings</div>
        <h2>{user.displayName || user.email}</h2>

        <form onSubmit={save}>
          <label className="modal-field">
            <span>First name</span>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} />
          </label>
          <label className="modal-field">
            <span>Last name</span>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} />
          </label>
          <label className="modal-field">
            <span>Phone</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} />
          </label>
          <label className="modal-field">
            <span>Email</span>
            <input type="email" value={user.email} disabled />
          </label>
          <label className="modal-field">
            <span>Approval status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="modal-select">
              <option value="approved">approved</option>
              <option value="pending">pending</option>
              <option value="declined">declined</option>
            </select>
          </label>
          <label className="modal-field">
            <span>Default view</span>
            <select value={simpleMode ? "simple" : "full"} onChange={(e) => setSimpleMode(e.target.value === "simple")} className="modal-select">
              <option value="full">Full view — all surfaces (AI, filters, cook mode, timers)</option>
              <option value="simple">Simple view — recipes + ingredients only</option>
            </select>
          </label>
          <label className="modal-field">
            <span>Default language</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="modal-select">
              <option value="en">English</option>
              <option value="pl">Polski (Polish)</option>
              <option value="es">Español de México (Mexican Spanish)</option>
              <option value="el">Ελληνικά (Greek)</option>
              <option value="pt">Português (Portuguese)</option>
            </select>
          </label>
          <label className="modal-field admin-toggle">
            <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
            <span>Admin (can see + edit every cookbook + manage users)</span>
          </label>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>

        <div className="modal-danger">
          <div className="head">Danger zone</div>
          {confirmDelete ? (
            <div className="danger-actions">
              <p>Delete <strong>{user.email}</strong>? Cascades through their cookbooks, recipes, memberships, favorites, and lab experiments.</p>
              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button type="button" className="btn danger" onClick={doDelete} disabled={saving}>
                  {saving ? "Deleting…" : "Delete account"}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn ghost danger-link" onClick={() => setConfirmDelete(true)}>
              Delete this account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Admin users panel — searchable table of every account with
// inline approve / decline + an edit modal for full profile +
// admin flag + status + delete.
//
// Rendered as a TAB inside AdminPage (no page chrome). The
// legacy AdminUsers default export is preserved as a wrapper
// for any caller still hitting the old standalone path.
function AdminUsersTab({ authEmail }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");

  const load = async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 403) throw new Error("Admin access required.");
        throw new Error(`Could not load users (${res.status}).`);
      }
      const { users: list } = await res.json();
      setUsers(list || []);
    } catch (err) {
      setError(err.message || "Could not load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const updateStatus = async (email, action) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}/${action}`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Could not ${action} user.`);
      }
      setUsers(prev => prev.map(u => u.email === email ? { ...u, status: action === "approve" ? "approved" : "declined" } : u));
    } catch (err) {
      setError(err.message);
    }
  };

  const pendingUsers = users.filter(u => u.status === "pending");
  const otherUsers = users.filter(u => u.status !== "pending");
  const filteredOthers = otherUsers.filter(u => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      u.email?.toLowerCase().includes(needle) ||
      u.displayName?.toLowerCase().includes(needle) ||
      u.firstName?.toLowerCase().includes(needle) ||
      u.lastName?.toLowerCase().includes(needle) ||
      u.phone?.toLowerCase().includes(needle) ||
      u.status?.toLowerCase().includes(needle)
    );
  });

  return (
    <div data-screen-label="12 Admin · Users">
      <p className="admin-tab-intro">
        Every account on Heirloom. Edit a user to change their name, phone, approval status, or admin flag; delete to cascade-remove their cookbooks, recipes, and memberships.
      </p>

      {error && <div className="settings-error">{error}</div>}

      {loading ? (
        <div style={{ color: "var(--ink-3)" }}>Loading users…</div>
      ) : (
        <>
          {pendingUsers.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <div className="section-head" style={{ color: "var(--accent)" }}>
                Pending approval ({pendingUsers.length})
              </div>
              <ul className="admin-users-list">
                {pendingUsers.map(u => (
                  <li key={u.email} className="admin-user-row pending">
                    <div className="who">
                      <div className="name">
                        {u.displayName || u.email}
                        <span className="role-tag pending-tag">pending</span>
                      </div>
                      <div className="email">{u.email}</div>
                      {u.phone && <div className="meta">{u.phone}</div>}
                      <div className="meta">requested {u.createdAt?.slice(0, 10)}</div>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="btn primary sm" onClick={() => updateStatus(u.email, "approve")}>
                        Approve
                      </button>
                      <button type="button" className="btn ghost sm danger-link" onClick={() => updateStatus(u.email, "decline")}>
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="admin-cookbooks">
            <div className="head-row">
              <div className="section-head">All users</div>
              <input
                type="search"
                className="admin-search"
                placeholder="Search name, email, phone…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>View</th>
                    <th>Lang</th>
                    <th className="num">Owned</th>
                    <th className="num">Member of</th>
                    <th aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOthers.length === 0 ? (
                    <tr><td colSpan={9} className="empty">No users match "{q}".</td></tr>
                  ) : filteredOthers.map(u => {
                    const isSelf = u.email === authEmail;
                    return (
                      <tr key={u.email} className={isSelf ? "active" : ""}>
                        <td>
                          {u.displayName || "—"}
                          {u.isAdmin && <span className="role-tag admin-tag" style={{ marginLeft: 6 }}>admin</span>}
                          {isSelf && <span className="role-tag self-tag" style={{ marginLeft: 6 }}>you</span>}
                        </td>
                        <td className="email">{u.email}</td>
                        <td className="email">{u.phone || "—"}</td>
                        <td>
                          <span className={`role-badge role-${u.status === "approved" ? "owner" : u.status === "declined" ? "viewer" : "editor"}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="email">{u.simpleMode ? "simple" : "full"}</td>
                        <td className="email">{u.lang === "pl" ? "PL" : "EN"}</td>
                        <td className="num">{u.ownedCount}</td>
                        <td className="num">{u.membershipCount}</td>
                        <td>
                          <button
                            type="button"
                            className="btn ghost icon-only"
                            onClick={() => setEditing(u)}
                            title="Edit user"
                            aria-label="Edit user"
                          >
                            <Icon name="edit" size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="admin-table-foot">
              {filteredOthers.length} of {otherUsers.length} users
            </div>
          </div>
        </>
      )}

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(null);
            setUsers(prev => prev.map(u => u.email === updated.email ? { ...u, ...updated } : u));
          }}
          onDeleted={(email) => {
            setEditing(null);
            setUsers(prev => prev.filter(u => u.email !== email));
          }}
        />
      )}
    </div>
  );
}

// "View as" preview controls — admin only. Lives as a tab inside
// the AdminPage; flipping a chip immediately reshapes the rest
// of the app to look like that role.
function ViewAsTab({ viewAsRole, onSetViewAs }) {
  const opts = [
    ["admin", "Admin", "Default. Everything visible: every cookbook, every member's email, full controls."],
    ["owner", "Owner", "Hides system-admin tools. Other people's cookbooks drop out of your library."],
    ["editor", "Editor", "No member management; no rename/delete cookbook. Can still add recipes + invite."],
    ["viewer", "Viewer", "Read-only. No Add recipe, no settings, no member management."],
  ];
  return (
    <div data-screen-label="View as">
      <p className="admin-tab-intro">
        Preview how the app looks for a non-admin role. Cosmetic only — server permissions are unchanged, so you can flip back instantly.
      </p>
      <div className="view-as-stack">
        {opts.map(([role, label, desc]) => {
          const active = role === "admin" ? !viewAsRole : viewAsRole === role;
          return (
            <button
              key={role}
              type="button"
              className={`view-as-row ${active ? "active" : ""}`}
              onClick={() => onSetViewAs(role === "admin" ? null : role)}
            >
              <div className="view-as-row-head">
                <span className="dot" aria-hidden />
                <span className="label">{label}</span>
                {active && <span className="badge">Active</span>}
              </div>
              <div className="view-as-row-desc">{desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Admin page — tabbed. Lives at /admin. Users · View as · AI usage.
export function AdminPage({ authEmail, onClose, viewAsRole, onSetViewAs, activeCookbookId, onOpenCookbook, onEditCookbook, initialTab = "cookbooks" }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="settings-page" data-screen-label="12 Admin">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      <div className="settings-header">
        <div className="eyebrow">Admin</div>
        <h1><em>Admin</em></h1>
      </div>

      <div className="tabbed-nav admin-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "cookbooks"} className={`tab ${tab === "cookbooks" ? "active" : ""}`} onClick={() => setTab("cookbooks")}>Cookbooks</button>
        <button type="button" role="tab" aria-selected={tab === "users"} className={`tab ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>Users</button>
        <button type="button" role="tab" aria-selected={tab === "view-as"} className={`tab ${tab === "view-as" ? "active" : ""}`} onClick={() => setTab("view-as")}>View as</button>
        <button type="button" role="tab" aria-selected={tab === "ai-usage"} className={`tab ${tab === "ai-usage" ? "active" : ""}`} onClick={() => setTab("ai-usage")}>AI usage</button>
      </div>

      {tab === "users" && <AdminUsersTab authEmail={authEmail} />}
      {tab === "cookbooks" && (
        <AdminCookbooksTab
          authEmail={authEmail}
          activeCookbookId={activeCookbookId}
          onOpenCookbook={onOpenCookbook}
          onEditCookbook={onEditCookbook}
        />
      )}
      {tab === "view-as" && (
        <ViewAsTab viewAsRole={viewAsRole} onSetViewAs={onSetViewAs} />
      )}
      {tab === "ai-usage" && <AdminAIUsage embedded onClose={() => {}} />}
    </div>
  );
}

// Legacy wrapper kept so any external link (or in-app code that
// imports `AdminUsers`) keeps working. New routes use AdminPage.
export function AdminUsers({ authEmail, onClose }) {
  return <AdminPage authEmail={authEmail} onClose={onClose} initialTab="users" />;
}
