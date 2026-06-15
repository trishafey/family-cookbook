// /cookbook/<slug>[/<tab>]
//
// Two surfaces share this route:
//   1. No tab in the URL → the cookbook landing page. Header
//      with the book cover + info + action row (Add recipe /
//      Invite cook / Settings), then the recipe grid below.
//   2. tab = "members" or "settings" → the full-page Manage
//      view, with its own back-button and a Members / Settings
//      tab toggle.
//
// Invite cook opens a small modal scoped to the invite-by-email
// + network-pill picker only — not the full member roster.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./helpers.jsx";
import { LANG_META } from "./i18n.js";
import { MembersSection, CookbookSettingsForm } from "./cookbooks.jsx";
import { renderCookbookTitle } from "./browse.jsx";
import { InviteCookModal } from "./invite-cook-modal.jsx";

const FLAG_SRC = {
  en: "/images/flags/en.png",
  enUS: "/images/flags/en-us.svg",
  pl: "/images/flags/pl.jpg",
  es: "/images/flags/es.png",
  el: "/images/flags/el.jpg",
  pt: "/images/flags/pt.png",
};

const LANG_NATIONALITY = {
  en: "Canadian",
  enUS: "American",
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
  goToAdmin,
  openAddRecipe,
  renderRecipesTab,
  query,
  setQuery,
  filters,
  openFilters,
}) {
  // Track where the cook landed here from (admin / library /
  // null) so the back button knows where to return them.
  // Captured once on mount and cleared so a subsequent
  // navigation away & back doesn't pick up the stale flag.
  const [fromSource] = useState(() => {
    try {
      const v = sessionStorage.getItem("cookbook-manage:from");
      if (v) sessionStorage.removeItem("cookbook-manage:from");
      return v || null;
    } catch { return null; }
  });
  const fromAdmin = fromSource === "admin";
  const fromLibrary = fromSource === "library";
  const [cookbook, setCookbook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);

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
  const canSeeMembers = role === "owner" || role === "editor" || role === "admin" || isAdmin;
  const canSeeSettings = role === "owner" || role === "admin" || isAdmin;
  // URL-driven mode: if tab is "members" or "settings", show
  // the full-page manage view. Default (null) shows the cookbook
  // landing.
  const isManageMode = cookbookTab === "members" || cookbookTab === "settings";
  const manageTab = (() => {
    if (cookbookTab === "settings" && canSeeSettings) return "settings";
    if (cookbookTab === "members" && canSeeMembers) return "members";
    if (canSeeSettings) return "settings";
    if (canSeeMembers) return "members";
    return null;
  })();

  const goToManage = (tab) => setCookbookTab?.(tab);
  const exitManage = () => setCookbookTab?.(null);

  // Active filter count for the Filters button badge.
  const filterCount = (() => {
    if (!filters) return 0;
    let n = 0;
    for (const k of ["origins", "courses", "diets", "occasions", "authors", "cuisines", "difficulties"]) {
      n += (filters[k] || []).length;
    }
    if (filters.maxTime) n += 1;
    return n;
  })();

  // When entering manage mode, scroll the page to the top
  // (manage is its own surface so a stale recipe-grid scroll
  // position doesn't make sense).
  const lastTabRef = useRef(cookbookTab);
  useLayoutEffect(() => {
    if (lastTabRef.current === cookbookTab) return;
    lastTabRef.current = cookbookTab;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [cookbookTab]);

  if (loading) {
    return (
      <div className="cookbook-page" data-screen-label="Cookbook">
        <button
          className="btn ghost"
          onClick={fromAdmin && goToAdmin ? goToAdmin : goToLibrary}
          style={{ marginBottom: 16 }}
        >
          <Icon name="chevL" /> {fromAdmin && goToAdmin ? "Back to admin page" : (fromLibrary ? "Back to my cookbooks" : "Back to library")}
        </button>
        <div style={{ color: "var(--ink-3)" }}>Loading cookbook…</div>
      </div>
    );
  }
  if (error || !cookbook) {
    return (
      <div className="cookbook-page" data-screen-label="Cookbook">
        <button
          className="btn ghost"
          onClick={fromAdmin && goToAdmin ? goToAdmin : goToLibrary}
          style={{ marginBottom: 16 }}
        >
          <Icon name="chevL" /> {fromAdmin && goToAdmin ? "Back to admin page" : (fromLibrary ? "Back to my cookbooks" : "Back to library")}
        </button>
        <div className="cookbooks-empty" style={{ color: "#933" }}>{error || "Not found."}</div>
      </div>
    );
  }

  const languages = (cookbook.languages && cookbook.languages.length ? cookbook.languages : ["en"]);
  const roleLabel = cookbook.adminAccess ? "admin access" : (role || "viewer");
  const nationalityLine = languages.map(c => LANG_NATIONALITY[c] || LANG_META[c]?.label || c).join(" · ");
  // Strip emoji + symbols from the name before pulling cover
  // initials so a cookbook like "Wojcik 🌶️🥑🥬" doesn't try
  // to render flame emoji on the book spine. Emoji stay on the
  // text label everywhere else.
  const stripEmoji = (s) =>
    (s || "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}️]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const coverInitials = stripEmoji(cookbook.name)
    .split(/\s+/)
    .filter(w => w && !/^(the|a|an|of|&|and)$/i.test(w))
    .map(w => w.replace(/['']s$/i, "")[0] || "")
    .filter(c => /[A-Za-z]/.test(c))
    .join("")
    .slice(0, 4)
    .toUpperCase();

  // ─── Manage mode (Members + Settings tabs) ───
  if (isManageMode) {
    return (
      <div className="cookbook-page cookbook-manage" data-screen-label={`Manage: ${cookbook.name}`}>
        <button
          className="btn ghost"
          onClick={
            fromAdmin && goToAdmin
              ? goToAdmin
              : (fromLibrary && goToLibrary ? goToLibrary : exitManage)
          }
          style={{ marginBottom: 16 }}
        >
          <Icon name="chevL" /> {
            fromAdmin && goToAdmin
              ? "Back to admin page"
              : (fromLibrary && goToLibrary ? "Back to my cookbooks" : `Back to ${cookbook.name}`)
          }
        </button>

        <div className="cookbook-segmented" role="tablist">
          {canSeeMembers && (
            <button
              type="button"
              role="tab"
              aria-selected={manageTab === "members"}
              className={`seg ${manageTab === "members" ? "active" : ""}`}
              onClick={() => goToManage("members")}
            >
              <Icon name="chef" size={14} /> Members
            </button>
          )}
          {canSeeSettings && (
            <button
              type="button"
              role="tab"
              aria-selected={manageTab === "settings"}
              className={`seg ${manageTab === "settings" ? "active" : ""}`}
              onClick={() => goToManage("settings")}
            >
              <Icon name="edit" size={14} /> Settings
            </button>
          )}
        </div>

        {manageTab === "members" && canSeeMembers && (
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
        {manageTab === "settings" && canSeeSettings && (
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

  // ─── Landing mode (header + action row + recipe grid) ───
  return (
    <div className="cookbook-page" data-screen-label={`Cookbook: ${cookbook.name}`}>
      <button className="btn ghost" onClick={goToLibrary} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to library
      </button>

      <div className="cookbook-header">
        <div
          className={`cookbook-cover ${cookbook.coverPhoto ? "has-photo" : ""}`}
          style={cookbook.coverColor ? { "--cookbook-cover-color": cookbook.coverColor } : undefined}
        >
          {cookbook.coverPhoto && (
            <img className="cover-photo" src={cookbook.coverPhoto} alt="" />
          )}
          <div className={`cover-bookmark role-${role || "viewer"}`}>
            {roleLabel}
          </div>
          <div className="cover-body">
            <div className="cover-initials">{coverInitials || "·"}</div>
          </div>
        </div>

        <div className="cookbook-info">
          {/* All pills in one row: count pills (desktop-only) +
              role pill + language pills. The count pills hide on
              mobile so the header stays tight. */}
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
            <span className="info-pill count-pill desktop-only">
              <Icon name="build" size={12} />
              <strong>{cookbook.recipeCount || 0}</strong>
              {(cookbook.recipeCount || 0) === 1 ? "recipe" : "recipes"}
            </span>
            <span className="info-pill count-pill desktop-only">
              <Icon name="chef" size={12} />
              <strong>{cookbook.memberCount || 0}</strong>
              {(cookbook.memberCount || 0) === 1 ? "cook" : "cooks"}
            </span>
          </div>

          <h1 className="cookbook-h1">{renderCookbookTitle(cookbook.name)}</h1>
          {cookbook.blurb && <p className="cookbook-tagline">{cookbook.blurb}</p>}

          <div className="cookbook-actions">
            {role !== "viewer" && (
              <button className="btn primary" onClick={openAddRecipe}>
                <Icon name="plus" /> Add a recipe
              </button>
            )}
            {canSeeMembers && (
              <button className="btn cookbook-action-btn" onClick={() => setInviteOpen(true)} title="Invite cook">
                <Icon name="chefAdd" /> <span className="btn-label">Invite cook</span>
              </button>
            )}
            {canSeeSettings && (
              <button className="btn cookbook-action-btn" onClick={() => goToManage("settings")} title="Settings">
                <Icon name="edit" /> <span className="btn-label">Settings</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cookbook-scoped search — always above the recipe grid. */}
      {setQuery && (
        <div className="cookbook-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            className="cookbook-search-input"
            placeholder={`Search ${cookbook.name}…`}
            value={query || ""}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="cookbook-search-close"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <Icon name="x" size={14} />
            </button>
          )}
          {openFilters && (
            <button
              type="button"
              className="cookbook-search-filter"
              onClick={openFilters}
              aria-label="Filters"
              title="Filters"
            >
              <Icon name="filter" size={15} />
              {filterCount > 0 && <span className="count">{filterCount}</span>}
            </button>
          )}
        </div>
      )}

      <div className="cookbook-recipes-tab">
        {renderRecipesTab ? renderRecipesTab() : null}
      </div>

      {inviteOpen && (
        <InviteCookModal
          cookbook={cookbook}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </div>
  );
}
