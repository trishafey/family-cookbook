// New /cookbook/<slug> page — replaces the old "click a card →
// switch active cookbook + go to browse" flow with a dedicated
// destination. Has a book-cover header, action buttons, and a
// Recipes / Members / Settings tab toggle gated by the cook's
// role on that cookbook. Members + Settings render inline (no
// more EditCookbookModal for the in-cookbook flow).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./helpers.jsx";
import { LANG_META } from "./i18n.js";
import { MembersSection, CookbookSettingsForm } from "./cookbooks.jsx";
import { renderCookbookTitle } from "./browse.jsx";

const FLAG_SRC = {
  en: "/images/flags/en.png",
  pl: "/images/flags/pl.jpg",
  es: "/images/flags/es.png",
  el: "/images/flags/el.jpg",
  pt: "/images/flags/pt.png",
};

// Map a lang code to a friendlier nationality-style label for the
// cover ("Polish · Canadian") and the info pills.
const LANG_NATIONALITY = {
  en: "Canadian",
  pl: "Polish",
  es: "Mexican",
  el: "Greek",
  pt: "Portuguese",
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

  // Keep the segmented tab bar anchored at the top of the
  // viewport when the cook switches tabs. Without this, going
  // from the tall Recipes tab to the shorter Members / Settings
  // can leave the browser snapping scroll position (because the
  // page is no longer tall enough to support the previous
  // offset), or the cook ends up looking at the cookbook header
  // again. useLayoutEffect runs synchronously before the browser
  // paints the new tab content so the cook never sees an
  // intermediate frame.
  const tabBarRef = useRef(null);
  const tabChangeFlag = useRef(false);
  const onTabClick = (t) => {
    tabChangeFlag.current = true;
    setCookbookTab?.(t === "recipes" ? null : t);
  };
  useLayoutEffect(() => {
    if (!tabChangeFlag.current) return;
    tabChangeFlag.current = false;
    const el = tabBarRef.current;
    if (!el) return;
    // Position the tab bar at the top of the viewport (or as
    // close as the page allows). Plain window.scrollTo using the
    // element's absolute Y avoids the "snap to 0" the browser
    // sometimes does when the page shrinks.
    const y = el.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }, [cookbookTab]);

  const shareCookbook = async () => {
    if (!cookbook) return;
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
  const nationalityLine = languages.map(c => LANG_NATIONALITY[c] || LANG_META[c]?.label || c).join(" · ");
  // Cover initials — first letter of each "significant" word in
  // the cookbook name, capped at 4 chars. e.g.
  //   "Heirloom Family Cookbook" → HFC
  //   "Wiktoria's Kitchen" → WK
  //   "Patricia's Personal Cookbook" → PPC
  const coverInitials = (cookbook.name || "")
    .split(/\s+/)
    .filter(w => w && !/^(the|a|an|of|&|and)$/i.test(w))
    .map(w => w.replace(/['']s$/i, "")[0] || "")
    .join("")
    .slice(0, 4)
    .toUpperCase();

  return (
    <div className="cookbook-page" data-screen-label={`Cookbook: ${cookbook.name}`}>
      <button className="btn ghost" onClick={goToLibrary} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to library
      </button>

      {/* Header — book cover (left) + book info (right) */}
      <div className="cookbook-header">
        <div className={`cookbook-cover ${cookbook.coverPhoto ? "has-photo" : ""}`}>
          {cookbook.coverPhoto && (
            <img className="cover-photo" src={cookbook.coverPhoto} alt="" />
          )}
          {/* Bookmark ribbon — top-left tag styled like the
              "YOURS" / role marker on a real book spine. */}
          <div className={`cover-bookmark role-${role || "viewer"}`}>
            {roleLabel}
          </div>
          {/* Compact cover content: just the initials of the
              cookbook name, centered. Tagline / nationality
              info has moved into the info column. */}
          <div className="cover-body">
            <div className="cover-initials">{coverInitials || "·"}</div>
          </div>
        </div>

        <div className="cookbook-info">
          {/* Pill row — role + per-language flag-and-name pills.
              Replaces the old mono eyebrow line. */}
          <div className="cookbook-pill-row">
            <span className={`info-pill role-pill role-${role || "viewer"}`}>{roleLabel}</span>
            {languages.map(code => (
              <span key={code} className="info-pill lang-pill">
                <img
                  src={FLAG_SRC[code] || FLAG_SRC.en}
                  alt=""
                  className="pill-flag"
                  aria-hidden="true"
                />
                {LANG_NATIONALITY[code] || LANG_META[code]?.label || code}
              </span>
            ))}
          </div>

          <h1 className="cookbook-h1">{renderCookbookTitle(cookbook.name)}</h1>
          {cookbook.blurb && <p className="cookbook-tagline">{cookbook.blurb}</p>}

          <div className="cookbook-info-meta">
            <span><strong>{cookbook.recipeCount || 0}</strong> recipes</span>
            <span><strong>{cookbook.memberCount || 0}</strong> {(cookbook.memberCount || 0) === 1 ? "cook" : "cooks"}</span>
          </div>

          <div className="cookbook-actions">
            {role !== "viewer" && (
              <button className="btn primary" onClick={openAddRecipe}>
                <Icon name="plus" /> Add a recipe
              </button>
            )}
            {canSeeMembers && (
              <button className="btn ghost" onClick={() => onTabClick("members")}>
                <Icon name="chef" /> Invite cooks
              </button>
            )}
            <button className="btn ghost" onClick={shareCookbook}>
              <Icon name="share" /> {shareCopied ? "Link copied!" : "Share cookbook"}
            </button>
          </div>
        </div>
      </div>

      {/* Segmented toggle — Recipes · Members · Settings. New
          styling, per Trisha's carve-out for the new component. */}
      {showTabs && (
        <div className="cookbook-segmented" role="tablist" ref={tabBarRef}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "recipes"}
            className={`seg ${activeTab === "recipes" ? "active" : ""}`}
            onClick={() => onTabClick("recipes")}
          >
            <Icon name="book" size={14} /> Recipes
          </button>
          {canSeeMembers && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "members"}
              className={`seg ${activeTab === "members" ? "active" : ""}`}
              onClick={() => onTabClick("members")}
            >
              <Icon name="chef" size={14} /> Members
            </button>
          )}
          {canSeeSettings && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "settings"}
              className={`seg ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => onTabClick("settings")}
            >
              <Icon name="edit" size={14} /> Settings
            </button>
          )}
        </div>
      )}

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
