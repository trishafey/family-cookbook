// Phase 4a stub — "My cookbooks" index.
//
// Reads the caller's cookbook memberships from /api/cookbooks and
// renders a card per cookbook. This is intentionally minimal: no
// create/edit/invite affordances yet — those land in 4b. The
// purpose of 4a is just to surface the data model that already
// exists so cooks see their family cookbook listed by name and
// can confirm the multi-tenant plumbing works end-to-end.
//
// Clicking a card today drops the cook back into the cookbook
// view (which still serves the bootstrap cookbook's recipes —
// 4a-2 wires per-cookbook scoping into useRecipes()).

import { useEffect, useState } from "react";
import { Icon, signInUrl } from "./helpers.jsx";

export function CookbooksIndex({ authEmail, activeCookbookId, onClose, onOpenCookbook }) {
  const [cookbooks, setCookbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authEmail) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cookbooks", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { cookbooks: list } = await res.json();
        if (!cancelled) setCookbooks(list || []);
      } catch (err) {
        if (!cancelled) setError("Could not load your cookbooks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authEmail]);

  return (
    <div className="cookbooks-page" data-screen-label="08 My Cookbooks">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      <div className="cookbooks-header">
        <div className="eyebrow">Your library</div>
        <h1>My <em>cookbooks</em></h1>
        <div className="intro">
          The cookbooks you own and the ones you've been invited to. Personal cookbooks, friend-to-friend sharing, and a public directory are coming.
        </div>
      </div>

      {!authEmail && (
        <div className="cookbooks-empty">
          <p><a href={signInUrl()}>Sign in</a> to see your cookbooks.</p>
        </div>
      )}

      {error && (
        <div className="cookbooks-empty" style={{ color: "#933" }}>{error}</div>
      )}

      {loading ? (
        <div style={{ marginTop: 32, color: "var(--ink-3)" }}>Loading your cookbooks…</div>
      ) : cookbooks.length === 0 && authEmail && !error ? (
        <div className="cookbooks-empty">
          <p>No cookbooks yet.</p>
        </div>
      ) : (
        <div className="cookbooks-grid">
          {cookbooks.map(cb => (
            <button
              key={cb.id}
              type="button"
              className={`cookbook-card ${cb.id === activeCookbookId ? "active" : ""}`}
              onClick={() => onOpenCookbook?.(cb)}
            >
              <div className="cookbook-card-head">
                <div className={`role-badge role-${cb.yourRole}`}>{cb.yourRole}</div>
                <div className={`vis-badge vis-${cb.visibility}`}>{cb.visibility}</div>
                {cb.id === activeCookbookId && (
                  <div className="role-badge active-badge">Active</div>
                )}
              </div>
              <h3 className="cookbook-name">{cb.name}</h3>
              <div className="cookbook-blurb">{cb.blurb}</div>
              <div className="cookbook-meta">
                <span>{cb.ownerEmail === authEmail ? "You own this" : `owned by ${cb.ownerEmail}`}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
