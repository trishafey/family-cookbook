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

function EditCookbookModal({ cookbook, onClose, onSaved, onDeleted }) {
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
      </div>
    </div>
  );
}

export function CookbooksIndex({ authEmail, activeCookbookId, onClose, onOpenCookbook }) {
  const [cookbooks, setCookbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null); // cookbook being edited

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

      {loading ? (
        <div style={{ marginTop: 32, color: "var(--ink-3)" }}>Loading your cookbooks…</div>
      ) : cookbooks.length === 0 && authEmail && !error ? (
        <div className="cookbooks-empty">
          <p>No cookbooks yet. Hit <em>New cookbook</em> to start one.</p>
        </div>
      ) : (
        <div className="cookbooks-grid">
          {cookbooks.map(cb => {
            const isOwner = cb.yourRole === "owner";
            return (
              <div
                key={cb.id}
                className={`cookbook-card ${cb.id === activeCookbookId ? "active" : ""}`}
              >
                <div className="cookbook-card-head">
                  <div className={`role-badge role-${cb.yourRole}`}>{cb.yourRole}</div>
                  <div className={`vis-badge vis-${cb.visibility}`}>{cb.visibility}</div>
                  {cb.id === activeCookbookId && (
                    <div className="role-badge active-badge">Active</div>
                  )}
                  {isOwner && (
                    <button
                      type="button"
                      className="cookbook-card-edit"
                      onClick={(e) => { e.stopPropagation(); setEditing(cb); }}
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
          })}
        </div>
      )}

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
          cookbook={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(null);
            setCookbooks(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
          }}
          onDeleted={(id) => {
            setEditing(null);
            setCookbooks(prev => prev.filter(c => c.id !== id));
          }}
        />
      )}
    </div>
  );
}
