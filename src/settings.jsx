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

// Admin users panel — Patricia (or future admins) can see every
// user and delete accounts. Lists the user's profile + how many
// cookbooks they own / are members of.
export function AdminUsers({ authEmail, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const remove = async (email) => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Could not delete user (${res.status}).`);
      }
      setUsers(prev => prev.filter(u => u.email !== email));
      setPendingDelete(null);
    } catch (err) {
      setError(err.message || "Could not delete user.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="settings-page" data-screen-label="12 Admin · Users">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      <div className="settings-header">
        <div className="eyebrow">Admin</div>
        <h1>All <em>users</em></h1>
        <div className="intro">
          Every account on Heirloom. Deleting a user cascades through their owned cookbooks, recipes, memberships, and personal data.
        </div>
      </div>

      {error && <div className="settings-error">{error}</div>}

      {loading ? (
        <div style={{ color: "var(--ink-3)" }}>Loading users…</div>
      ) : (
        <ul className="admin-users-list">
          {users.map(u => {
            const isSelf = u.email === authEmail;
            return (
              <li key={u.email} className="admin-user-row">
                <div className="who">
                  <div className="name">
                    {u.displayName || u.email}
                    {u.isAdmin && <span className="role-tag admin-tag">admin</span>}
                    {isSelf && <span className="role-tag self-tag">you</span>}
                  </div>
                  <div className="email">{u.email}</div>
                  {u.phone && <div className="meta">{u.phone}</div>}
                  <div className="meta">
                    {u.ownedCount} owned · {u.membershipCount} membership{u.membershipCount === 1 ? "" : "s"} · joined {u.createdAt?.slice(0, 10)}
                  </div>
                </div>
                {!isSelf && (
                  pendingDelete === u.email ? (
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setPendingDelete(null)}
                      >Cancel</button>
                      <button
                        type="button"
                        className="btn danger sm"
                        onClick={() => remove(u.email)}
                        disabled={deleting}
                      >
                        {deleting ? "Deleting…" : "Confirm delete"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost sm danger-link"
                      onClick={() => setPendingDelete(u.email)}
                    >
                      Delete account
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
