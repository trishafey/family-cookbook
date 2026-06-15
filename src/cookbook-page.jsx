// New /cookbook/<slug> page — replaces the old "click a card →
// switch active cookbook + go to browse" flow with a dedicated
// destination. Has a book-cover header, action buttons, and a
// Recipes / Members / Settings tab toggle gated by the cook's
// role on that cookbook. Members + Settings render inline (no
// more EditCookbookModal for the in-cookbook flow).
//
// Phase A scope:
//   - Book cover panel + role tag + language flags + tagline
//   - Add recipe / Invite cooks / Share cookbook actions
//   - 3-tab toggle (owner: all, editor: recipes+members,
//     viewer: hidden — they only see recipes)
//   - Recipes tab embeds Browse via a render-prop
//   - Members + Settings reuse MembersSection + CookbookSettingsForm
//   - Share cookbook copies a /cookbook/<slug> link to clipboard
//     for now; the public /c/<slug> URL comes in Phase C
//
// Active cookbook id is derived from the URL slug — entering the
// page sets activeCookbookId, leaving doesn't reset it (the cook
// can keep using it as their "current" cookbook in the recipes
// endpoint until they pick another).

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./helpers.jsx";
import { LANG_META } from "./i18n.js";
import { MembersSection, CookbookSettingsForm } from "./cookbooks.jsx";

const FLAG_SRC = {
  en: "/images/flags/en.png",
  pl: "/images/flags/pl.jpg",
  es: "/images/flags/es.png",
  el: "/images/flags/el.jpg",
  pt: "/images/flags/pt.png",
};

export function CookbookPage({
  cookbookSlug,
  cookbookTab,
  setCookbookTab,
  authEmail,
  isAdmin,
  setActiveCookbookId,
  goToLibrary,
  openAddRecipe,
  renderRecipesTab,
}) {
  const [cookbook, setCookbook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);

  // Fetch the cookbook by slug from the list endpoint, then load
  // the detail endpoint for the freshest counts + members.
  const load = async () => {
    if (!authEmail) { setLoading(false); return; }
    setError(null);
    try {
      const res = await fetch("/api/admin/cookbooks", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { cookbooks } = await res.json();
      const match = (cookbooks || []).find(c => c.slug === cookbookSlug || c.id === cookbookSlug);
      if (!match) {
        setError("That cookbook doesn't exist, or you don't have access to it.");
        setLoading(false);
        return;
      }
      setCookbook(match);
      setActiveCookbookId?.(match.id);
    } catch (err) {
      setError("Could not load this cookbook.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cookbookSlug, authEmail]);

  // Decide which tabs are visible based on role.
  const role = cookbook?.yourRole;
  const canSeeMembers = role === "owner" || role === "editor" || role === "admin";
  const canSeeSettings = role === "owner" || role === "admin" || isAdmin;
  const showTabs = canSeeMembers || canSeeSettings;
  const activeTab = (() => {
    const t = cookbookTab || "recipes";
    if (t === "members" && !canSeeMembers) return "recipes";
    if (t === "settings" && !canSeeSettings) return "recipes";
    return t;
  })();

  const onTabClick = (t) => setCookbookTab?.(t === "recipes" ? null : t);

  const shareCookbook = async () => {
    if (!cookbook) return;
    // Phase A: copy the authenticated cookbook URL. Phase C will
    // swap this for a /c/<slug> public viewer link.
    const url = `${window.location.origin}/cookbook/${encodeURIComponent(cookbook.slug || cookbook.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    } catch {}
  };

  if (loading) {
    return (
      <div className="cookbook-page" data-screen-label="Cookbook">
        <button className="btn ghost" onClick={goToLibrary} style={{ marginBottom: 16 }}>
          <Icon name="chevL" /> Back to library
        </button>
        <div style={{ color: "var(--ink-3)" }}>Loading cookbook…</div>
      </div>
    );
  }
  if (error || !cookbook) {
    return (
      <div className="cookbook-page" data-screen-label="Cookbook">
        <button className="btn ghost" onClick={goToLibrary} style={{ marginBottom: 16 }}>
          <Icon name="chevL" /> Back to library
        </button>
        <div className="cookbooks-empty" style={{ color: "#933" }}>{error || "Not found."}</div>
      </div>
    );
  }

  const languages = (cookbook.languages && cookbook.languages.length ? cookbook.languages : ["en"]);
  const roleLabel = cookbook.adminAccess ? "admin access" : (role || "viewer");

  return (
    <div className="cookbook-page" data-screen-label={`Cookbook: ${cookbook.name}`}>
      <button className="btn ghost" onClick={goToLibrary} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to library
      </button>

      {/* Header — book cover (left) + book info (right) */}
      <div className="cookbook-header">
        <div className="cookbook-cover">
          <div className={`role-badge role-${role || "viewer"}`}>{roleLabel}</div>
          <div className="cover-flags">
            {languages.map(code => (
              <img
                key={code}
                src={FLAG_SRC[code] || FLAG_SRC.en}
                alt={LANG_META[code]?.label || code}
                title={LANG_META[code]?.label || code}
                className="cover-flag"
              />
            ))}
          </div>
          <div className="cover-name">{cookbook.name}</div>
          {cookbook.blurb && <div className="cover-blurb">{cookbook.blurb}</div>}
        </div>

        <div className="cookbook-info">
          <div className="eyebrow">
            {/^personal-/i.test(cookbook.id) ? "Personal" : "Family"}
            {cookbook.blurb ? ` · ${cookbook.blurb}` : ""}
          </div>
          <h1>{cookbook.name}</h1>
          {cookbook.blurb && <p className="cookbook-tagline">{cookbook.blurb}</p>}

          <div className="cookbook-info-meta">
            <span><strong>{cookbook.recipeCount || 0}</strong> recipes</span>
            <span><strong>{cookbook.memberCount || 0}</strong> {(cookbook.memberCount || 0) === 1 ? "cook" : "cooks"}</span>
            <span className="info-flags">
              {languages.map(code => (
                <img
                  key={code}
                  src={FLAG_SRC[code] || FLAG_SRC.en}
                  alt={LANG_META[code]?.label || code}
                  title={LANG_META[code]?.label || code}
                  className="info-flag"
                />
              ))}
            </span>
          </div>

          <div className="cookbook-actions">
            {role !== "viewer" && (
              <button className="btn primary" onClick={openAddRecipe}>
                <Icon name="plus" /> Add a recipe
              </button>
            )}
            {canSeeMembers && (
              <button className="btn ghost" onClick={() => onTabClick("members")}>
                <Icon name="share" /> Invite cooks
              </button>
            )}
            <button className="btn ghost" onClick={shareCookbook}>
              <Icon name="link" /> {shareCopied ? "Link copied!" : "Share cookbook"}
            </button>
          </div>
        </div>
      </div>

      {/* Tab toggle — only shown when the cook can see Members
          or Settings; pure viewers just see recipes. */}
      {showTabs && (
        <div className="tabbed-nav cookbook-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "recipes"}
            className={`tab ${activeTab === "recipes" ? "active" : ""}`}
            onClick={() => onTabClick("recipes")}
          >
            <Icon name="book" size={14} /> Recipes
          </button>
          {canSeeMembers && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "members"}
              className={`tab ${activeTab === "members" ? "active" : ""}`}
              onClick={() => onTabClick("members")}
            >
              <Icon name="share" size={14} /> Members
            </button>
          )}
          {canSeeSettings && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "settings"}
              className={`tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => onTabClick("settings")}
            >
              <Icon name="edit" size={14} /> Settings
            </button>
          )}
        </div>
      )}

      {/* Tab body */}
      {activeTab === "recipes" && (
        <div className="cookbook-recipes-tab">
          {renderRecipesTab ? renderRecipesTab() : null}
        </div>
      )}
      {activeTab === "members" && canSeeMembers && (
        <div className="cookbook-tab-body">
          <MembersSection
            cookbook={cookbook}
            authEmail={authEmail}
            isAdmin={isAdmin}
            canRemoveMembers={canSeeSettings}
            onMembersChanged={load}
          />
        </div>
      )}
      {activeTab === "settings" && canSeeSettings && (
        <div className="cookbook-tab-body">
          <CookbookSettingsForm
            cookbook={cookbook}
            isAdmin={isAdmin}
            onSaved={(updated) => setCookbook(prev => ({ ...prev, ...updated }))}
            onDeleted={() => goToLibrary?.()}
          />
        </div>
      )}
    </div>
  );
}
