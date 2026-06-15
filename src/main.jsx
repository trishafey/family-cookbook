// Main app — router, top nav, tweaks panel, modal hosts.

import { useState, useEffect, useMemo, useRef } from "react";
import ReactDOM from "react-dom/client";
import { Icon, useStorage, useRouting, useRecipes, useAuth, useFavorites, useUserCookbooks, useProfile, usePendingApprovalCount, useNotificationCount, signInUrl, SIGN_OUT_URL, applyFilters, logEvent, normalizeRecipe, localizeRecipe, ErrorBoundary, recipeSuggestions, BOOTSTRAP_COOKBOOK_ID } from "./helpers.jsx";
import { useLang, LANG_META } from "./i18n.js";
import { FLAGS } from "./config/flags.js";
import { TweaksPanel, TweakSection, TweakRadio, TweakSelect, useTweaks } from "./tweaks-panel.jsx";
import { FiltersDrawer } from "./filters.jsx";
import { Browse } from "./browse.jsx";
import { CookbookPage } from "./cookbook-page.jsx";
import { RecipeDetail } from "./recipe.jsx";
import { AddRecipe } from "./add-recipe.jsx";
import { ExperimentationLab } from "./experiment.jsx";
import { CookbooksIndex } from "./cookbooks.jsx";
import { InviteAccept } from "./invite.jsx";
import { Notifications } from "./notifications.jsx";
import { ProfileSetupGate, PendingApprovalGate } from "./profile.jsx";
import { AccountSettings, AdminPage } from "./settings.jsx";
import { SignedOutLanding } from "./landing.jsx";
import { BuildAMeal } from "./meal.jsx";
import { PlanMealModal, MealPlanPage } from "./meal-plan.jsx";
import { ShoppingList } from "./shopping.jsx";
import { CookMode } from "./cook-mode.jsx";
import { TimerTicker } from "./timers.jsx";
import { TimerBanner } from "./timer-banner.jsx";

// Track viewport ≥ 720px (tablet + desktop). NavSearch uses
// this to gate the collapsing behaviour — mobile always shows
// the full search bar, tablet/desktop collapses to an icon.
function useIsTabletUp() {
  const [val, setVal] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 720px)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 720px)");
    const handler = (e) => setVal(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return val;
}

// Nav search bar.
//   - Mobile (<720px): always shown expanded, full width.
//   - Tablet/desktop: starts collapsed as an outlined icon
//     button; clicking expands with a smooth width transition.
//     Auto-collapses on blur when the input is empty.
// Predictive recipe matches drop down beneath the input while
// the cook is typing; clicking one opens the recipe.

// Phase 4a-2: dropdown that switches the active cookbook. Only
// renders when the cook is in 2+ cookbooks — single-cookbook
// users (the family today) see nothing.
function CookbookSwitcher({ active, cookbooks, onSwitch, onManage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  // Render even for a single cookbook so the "My cookbooks" link
  // is still reachable. If the cook has no cookbooks at all (rare
  // — first sign-in before bootstrap completes), skip.
  if (!cookbooks || cookbooks.length === 0) return null;
  const current = cookbooks.find(c => c.id === active) || cookbooks[0];
  return (
    <div className="cookbook-switcher" ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="btn ghost sm cookbook-switcher-toggle"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current?.name}
      >
        <Icon name="book" size={15} />
        <span className="btn-label name">{current?.name}</span>
      </button>
      {open && (
        <div className="cookbook-switcher-menu" role="menu">
          {onManage && (
            <button
              type="button"
              role="menuitem"
              className="item manage"
              onClick={() => { setOpen(false); onManage(); }}
            >
              Cookbooks →
            </button>
          )}
          {cookbooks.length > 1 && cookbooks.map(c => (
            <button
              key={c.id}
              type="button"
              role="menuitemradio"
              aria-checked={c.id === active}
              className={`item ${c.id === active ? "active" : ""}`}
              onClick={() => { setOpen(false); onSwitch(c.id); }}
            >
              <div className="t">{c.name}</div>
              <div className="s">{c.yourRole}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// "Make" — consolidates the Lab + Build a meal entries into one
// dropdown so the nav doesn't grow a button per tool. Icons are
// stripped from the menu items themselves; the trigger uses the
// build icon as the Make affordance.
function MakeDropdown({ currentView, selectionCount, onOpenLab, onOpenMeal, showLab, showMeal }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  if (!showLab && !showMeal) return null;
  const inMake = currentView === "lab" || currentView === "meal" || currentView === "meal-plan";
  return (
    <div className="make-dropdown" ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`btn ghost sm make-dropdown-toggle ${inMake ? "active" : ""}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="build" size={15} />
        <span className="btn-label">Make</span>
        {selectionCount > 0 && (
          <span style={{ marginLeft: 4, padding: "1px 6px", background: "var(--accent)", color: "var(--paper)", borderRadius: 999, fontSize: 10, fontWeight: 600 }}>{selectionCount}</span>
        )}
      </button>
      {open && (
        <div className="make-dropdown-menu" role="menu">
          {showLab && (
            <button
              type="button"
              role="menuitem"
              className={`item ${currentView === "lab" ? "active" : ""}`}
              onClick={() => { setOpen(false); onOpenLab(); }}
            >
              The Lab
            </button>
          )}
          {showMeal && (
            <button
              type="button"
              role="menuitem"
              className={`item ${currentView === "meal" || currentView === "meal-plan" ? "active" : ""}`}
              onClick={() => { setOpen(false); onOpenMeal(); }}
            >
              Build a meal
              {selectionCount > 0 && (
                <span className="count">{selectionCount}</span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
function NavSearch({ query, setQuery, placeholder, mobilePlaceholder, simpleMode, onOpenFilters, filtersLabel, recipes, onOpenRecipe }) {
  const isTabletUp = useIsTabletUp();
  // Bar starts collapsed on every viewport — the pill icon next to
  // the brand. Tapping expands; blur or click-away with an empty
  // input collapses again. On mobile the expanded bar drops to
  // row 2 of the nav (full width); on tablet/desktop it inflates
  // inline.
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);
  // Close suggestions when clicking outside the search wrapper.
  useEffect(() => {
    if (!focused) return;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setFocused(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [focused]);
  const handleBlur = () => {
    // Collapse on blur whenever the input is empty — same rule on
    // mobile and desktop now.
    if (!query) setExpanded(false);
  };
  // Single DOM tree in both states — toggling a .collapsed class
  // on the wrapper lets CSS transitions animate width AND opacity
  // symmetrically (the open animation is the reverse of close).
  const collapsed = !expanded;
  const suggestions = focused && !collapsed ? recipeSuggestions(query, recipes) : [];
  // Pick the right placeholder for the viewport — the long
  // "Search by recipe, cook, cuisine, or ingredient…" gets
  // truncated mid-word on narrow phones.
  const ph = !isTabletUp && mobilePlaceholder ? mobilePlaceholder : placeholder;
  return (
    <div className={`search-wrap ${collapsed ? "collapsed" : ""}`} ref={wrapRef}>
      <div
        className={`search ${collapsed ? "collapsed" : ""}`}
        onClick={collapsed ? () => setExpanded(true) : undefined}
        role={collapsed ? "button" : undefined}
        aria-label={collapsed ? placeholder : undefined}
        tabIndex={collapsed ? 0 : undefined}
        onKeyDown={collapsed ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(true); } } : undefined}
      >
        <Icon name="search" />
        <input
          ref={inputRef}
          placeholder={ph}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          tabIndex={collapsed ? -1 : 0}
          aria-hidden={collapsed ? true : undefined}
        />
        {query && !collapsed && <button className="btn ghost icon-only" onClick={() => setQuery("")}><Icon name="x" size={14} /></button>}
        {!simpleMode && !collapsed && (
          <button
            className="btn ghost icon-only search-filter-btn"
            onClick={onOpenFilters}
            title={filtersLabel}
            aria-label={filtersLabel}
          >
            <Icon name="filter" size={16} />
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="search-suggestions" role="listbox">
          {suggestions.map(r => (
            <button
              key={r.id}
              type="button"
              role="option"
              className="search-suggestion"
              onMouseDown={(e) => {
                // mousedown so we fire BEFORE the input's blur
                // tears down the suggestions list.
                e.preventDefault();
                onOpenRecipe?.(r);
                setFocused(false);
                setQuery("");
              }}
            >
              {r.photoCard || r.photo ? (
                <span
                  className="thumb"
                  style={{ backgroundImage: `url(${r.photoCard || r.photo})` }}
                  aria-hidden
                />
              ) : null}
              <span className="text">
                <span className="title">{r.title}</span>
                <span className="sub">{r.author ? `by ${r.author}` : r.cuisine}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  // ─── View routing ───
  // view: "browse" | "recipe" | "add" | "edit" | "meal"
  // View routing persists in sessionStorage so a refresh keeps you on
  // the recipe / meal-plan / edit page you were on. localStorage would
  // outlive the browser session, which is undesirable here — we don't
  // want to drop returning visitors straight into the last recipe
  // they opened days ago.
  // URL-backed routing — view + recipeId + editingId are derived
  // from window.location so the browser back button works and
  // every recipe is a shareable link. The setView / setRecipeId /
  // setEditingId helpers below preserve the existing call-site
  // API so the rest of this file is unchanged.
  const [route, setRoute] = useRouting();
  const view = route.view;
  const recipeId = route.recipeId;
  const editingId = route.editingId;
  const inviteToken = route.inviteToken;
  const cookbookSlug = route.cookbookSlug;
  const cookbookTab = route.cookbookTab;
  const setView = (newView) => setRoute(s => ({ ...s, view: newView }));
  const setRecipeId = (id) => setRoute(s => ({ ...s, recipeId: id }));
  const setEditingId = (id) => setRoute(s => ({ ...s, editingId: id }));
  const setCookbookTab = (t) => setRoute(s => ({ ...s, cookbookTab: t }));
  const goToCookbook = (slug, tab = null) => {
    setRoute({ view: "cookbook", recipeId: null, editingId: null, cookbookSlug: slug, cookbookTab: tab });
    window.scrollTo(0, 0);
  };
  const goToLibrary = () => { setView("cookbooks"); window.scrollTo(0, 0); };

  // ─── Recipe collection ───
  // Server-of-record is the D1 cookbook via /api/recipes; useRecipes caches
  // the response in localStorage so the site loads instantly for returning
  // visitors. `extraRecipes` is the legacy per-device list from before the
  // shared backend — merged in so old additions don't disappear.
  // Phase 4a-2: active cookbook context. Defaults to the family
  // cookbook so existing users see no change. Switching cookbooks
  // via the nav switcher (built in 4b) updates this; the recipe
  // fetch refetches under a new cache key.
  const [activeCookbookId, setActiveCookbookId] = useStorage("nav:cookbookId", BOOTSTRAP_COOKBOOK_ID);
  const { recipes: serverRecipes, refresh: refreshRecipes } = useRecipes(activeCookbookId);
  const [extraRecipes, setExtraRecipes] = useStorage("recipes:added", []);
  // Read language up-front so the recipes list can flow through
  // localizeRecipe before anything downstream sees it. Cards, recipe
  // pages, meal plan, cook mode — they all consume `recipes` so we
  // only have to localize once at this seam.
  const { lang: currentLang } = useLang();
  const canonicalRecipes = useMemo(
    () => [...extraRecipes.map(normalizeRecipe), ...serverRecipes],
    [extraRecipes, serverRecipes]
  );
  const recipes = useMemo(
    () => canonicalRecipes.map(r => localizeRecipe(r, currentLang)),
    [canonicalRecipes, currentLang]
  );
  // Cuisines actually used in the cookbook, most-frequent first — pinned
  // as pills at the top of the cuisine dropdown in AddRecipe.
  const usedCuisines = useMemo(() => {
    const counts = {};
    for (const r of recipes) if (r.cuisine) counts[r.cuisine] = (counts[r.cuisine] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [recipes]);
  // Past 'Added by' authors, most-recently used first. Powers the
  // datalist suggestions in the AddRecipe form so the user usually
  // picks a name with one tap instead of retyping.
  const usedAuthors = useMemo(() => {
    const seen = new Map();
    const sorted = [...recipes].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    for (const r of sorted) {
      if (r.author && !seen.has(r.author)) seen.set(r.author, r.updated_at || 0);
    }
    return Array.from(seen.keys());
  }, [recipes]);
  const recipe = recipes.find(r => r.id === recipeId);

  // On-demand translation: when the cook lands on a recipe in a
  // language that doesn't have a stored translation yet, fire the
  // ensure-translation endpoint in the background and refetch when
  // it lands. Avoids the "switch to Spanish, see English text"
  // gap on recipes that pre-date the cookbook's language pick.
  // Guards against re-firing for the same recipe+lang pair so a
  // brief failure doesn't spam the API.
  const translatingRef = useRef(new Set());
  useEffect(() => {
    if (view !== "recipe" || !recipeId) return;
    const canonical = canonicalRecipes.find(r => r.id === recipeId);
    if (!canonical) return;
    const canonLang = canonical.canonical_lang || "en";
    if (currentLang === canonLang) return;
    if (canonical.translations && canonical.translations[currentLang]) return;
    const key = `${recipeId}:${currentLang}`;
    if (translatingRef.current.has(key)) return;
    translatingRef.current.add(key);
    (async () => {
      try {
        const res = await fetch(`/api/admin/recipes/${encodeURIComponent(recipeId)}/ensure-translation`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang: currentLang }),
        });
        if (res.ok) await refreshRecipes();
      } catch {}
    })();
  }, [view, recipeId, currentLang, canonicalRecipes, refreshRecipes]);

  // ─── Language (English / Polish) ───
  // currentLang above is from the same hook; pulling the rest of the
  // helpers here so the localised data flows from one source.
  const { t, tDiet, tOccasion, tCourse } = useLang();

  // ─── Sign-in state ───
  const { email: authEmail, loading: authLoading } = useAuth();
  // Phase 4a-2: the cook's cookbook memberships. Drives the nav
  // switcher (hidden when there's only one), the cookbooks index,
  // and the active-cookbook validation below.
  const { cookbooks: userCookbooks } = useUserCookbooks(authEmail);
  // Phase 4b-2 follow-up: profile gate. If first_name / last_name
  // aren't on file yet, the app renders the setup form before
  // anything else.
  const { profile, loading: profileLoading, save: saveProfile, refresh: refreshProfile } = useProfile(authEmail);
  // Pending-approval count for the admin avatar badge. 0 for
  // non-admins / signed-out cooks.
  const pendingCount = usePendingApprovalCount(!!profile?.isAdmin);
  // Pending cookbook invitations addressed to this cook. Powers
  // the Notifications menu entry + avatar badge.
  const notificationCount = useNotificationCount(authEmail);

  // ─── Admin "View as" preview ───
  // Admin-only knob — lets an admin preview the app as if they
  // were a regular owner / editor / viewer (no admin powers,
  // no admin-access cookbooks). Purely client-side cosmetic:
  // the server still allows admin operations. Lives as a tab
  // inside /admin. null = default (full admin view).
  const [viewAsRole, setViewAsRole] = useStorage("admin:viewAs", null);
  const isReallyAdmin = !!profile?.isAdmin;
  const effectiveIsAdmin = isReallyAdmin && !viewAsRole;
  const ROLE_RANK = { owner: 3, editor: 2, viewer: 1, admin: 0 };
  const effectiveUserCookbooks = useMemo(() => {
    if (!viewAsRole || !isReallyAdmin) return userCookbooks;
    const cap = ROLE_RANK[viewAsRole] || 0;
    return userCookbooks
      .filter(c => !c.adminAccess) // non-admins wouldn't see these
      .map(c => {
        const actualRank = ROLE_RANK[c.yourRole] || 0;
        return actualRank > cap ? { ...c, yourRole: viewAsRole } : c;
      });
  }, [userCookbooks, viewAsRole, isReallyAdmin]);

  // When the active cookbook changes (or its language list does),
  // make sure the cook's selected language is one of the
  // cookbook's available ones. If not, fall back to the first
  // available — typically English.
  //
  // Guard: skip when the active cookbook hasn't loaded yet
  // (e.g. on first paint, before /api/admin/cookbooks resolves).
  // Otherwise we'd see "no cookbook found → default to [en] →
  // reset" and immediately stomp on whatever the cook just
  // picked from the FAB.
  const { lang: currentLang2, setLang: setLangGlobal } = useLang();
  useEffect(() => {
    if (!effectiveUserCookbooks || effectiveUserCookbooks.length === 0) return;
    const active = effectiveUserCookbooks.find(c => c.id === activeCookbookId);
    if (!active) return;
    const langs = active.languages || ["en"];
    if (!langs.includes(currentLang2)) {
      setLangGlobal(langs[0] || "en");
    }
  }, [activeCookbookId, effectiveUserCookbooks, currentLang2, setLangGlobal]);

  // ─── Simplified view ───
  // Accessibility-first mode for less technical cooks (especially
  // older family members). Strips out AI surfaces, filters,
  // timing, nutrition, and the cook-mode flow — leaves the
  // printout-like core (photo, ingredients, steps, comments,
  // pairings). Toggled from the avatar menu. Body class drives
  // typography/layout adjustments in CSS.
  const [simpleMode, setSimpleMode] = useStorage("ui:simpleMode", false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("simple-mode", !!simpleMode);
    return () => document.body.classList.remove("simple-mode");
  }, [simpleMode]);

  // ─── Search / filter ───
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    courses: [], diets: [], occasions: [],
    authors: [], cuisines: [], difficulties: [], origins: [],
    maxTime: 0,
  });
  const filtered = useMemo(() => applyFilters(recipes, { q: query, ...filters }), [recipes, query, filters]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Snackbar — generic one-message toast at the bottom of the
  // screen. Currently driven by the "Add to cookbook" flow on
  // the recipe page, but designed as a shared affordance so other
  // success / undo flows can reuse it. `{ message, action: {
  // label, onClick } }`. Auto-dismisses after a few seconds.
  const [snackbar, setSnackbar] = useState(null);
  useEffect(() => {
    if (!snackbar) return;
    const id = setTimeout(() => setSnackbar(null), 5500);
    return () => clearTimeout(id);
  }, [snackbar]);

  // Analytics: log search queries (debounced) and filter applies.
  // For filters we compare to the previous snapshot and emit one
  // event per newly-added selection — so the dashboard shows what
  // people actively chose, not what was already on screen.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const handle = setTimeout(() => logEvent("search", null, { query: q.slice(0, 100) }), 1500);
    return () => clearTimeout(handle);
  }, [query]);
  const prevFiltersRef = useRef(null);
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (prev) {
      for (const k of ["courses", "diets", "occasions", "authors", "cuisines", "difficulties", "origins"]) {
        const added = (filters[k] || []).filter(v => !(prev[k] || []).includes(v));
        for (const v of added) logEvent("filter-apply", null, { filter: k, value: v });
      }
      if (filters.maxTime && filters.maxTime !== prev.maxTime) {
        logEvent("filter-apply", null, { filter: "maxTime", value: String(filters.maxTime) });
      }
    }
    prevFiltersRef.current = filters;
  }, [filters]);

  // ─── Meal selection ───
  const [selection, setSelection] = useStorage("meal:selection", []);
  const selectionMode = view === "meal";
  const toggleSelect = (r) => {
    setSelection(s => s.includes(r.id) ? s.filter(x => x !== r.id) : [...s, r.id]);
  };
  // Build-a-meal entry point used by the pairings modal. Stages the
  // currently-open recipe plus the chosen pairing as a meal and
  // jumps straight to the meal-builder view.
  const buildMealWith = (currentRecipe, pairedRecipe) => {
    setSelection(s => {
      const merged = new Set([...s, currentRecipe.id, pairedRecipe.id]);
      return [...merged];
    });
    setView("meal");
    setRecipeId(null);
  };

  // ─── Favorites (per signed-in user, stored in D1) ───
  const { favorites, toggleFavorite } = useFavorites(authEmail);

  // ─── Shopping list modal ───
  const [shopOpen, setShopOpen] = useState(false);
  const [shopPayload, setShopPayload] = useState(null);
  const openShop = (payload) => { setShopPayload(payload); setShopOpen(true); };

  // ─── Cooking mode ───
  const [cookState, setCookState] = useState(null); // { recipe, steps, ings }
  const [finishTime, setFinishTime] = useState(() => {
    const d = new Date(); d.setHours(18, 0, 0, 0); return d;
  });
  const openCook = (r, steps, ings) => setCookState({ recipe: r, steps, ings });

  // ─── Meal plan flow ───
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planRecipes, setPlanRecipes] = useState([]);
  const [mealPlan, setMealPlan] = useState(null); // { recipes, finishTime } when active
  const openPlanMeal = (recipes) => { setPlanRecipes(recipes); setPlanModalOpen(true); };
  const confirmPlan = (when, opts = {}) => {
    setFinishTime(when);
    setMealPlan({ recipes: planRecipes, finishTime: when, eveningHour: opts.eveningHour ?? 19 });
    setPlanModalOpen(false);
    setView("meal-plan");
    window.scrollTo(0, 0);
  };

  // ─── User-added comments — POSTs to the API, then refreshes the
  // recipes list so the new comment appears (it's returned inline in
  // each recipe's liveComments). Throws so the form can show errors.
  const addComment = async (rid, body) => {
    const res = await fetch(`/api/admin/recipes/${encodeURIComponent(rid)}/comments`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || `Could not post note (${res.status})`);
    }
    await refreshRecipes();
  };

  const deleteComment = async (cid) => {
    const res = await fetch(`/api/admin/comments/${encodeURIComponent(cid)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || `Could not delete (${res.status})`);
    }
    await refreshRecipes();
  };

  // ─── Save a recipe (create or update) ───
  // POSTs new drafts to /api/admin/recipes, PATCHes existing ones at
  // /api/admin/recipes/:id. Refreshes the cached list so the change
  // shows up everywhere immediately. Throws on failure so the form
  // can render the error inline.
  const onSaveRecipe = async (draft) => {
    // A "legacy" entry exists only in extraRecipes localStorage. Saving
    // such an entry POSTs it as new (effectively migrating to D1) then
    // strips it from localStorage. Server-stored entries update via PATCH.
    const isLegacy = extraRecipes.some(r => r.id === draft.id);
    const isUpdate = !isLegacy && serverRecipes.some(r => r.id === draft.id);
    const url = isUpdate ? `/api/admin/recipes/${encodeURIComponent(draft.id)}` : "/api/admin/recipes";
    const method = isUpdate ? "PATCH" : "POST";
    // Phase 4b-3: stamp the active cookbook on new drafts so the
    // server scopes the write correctly. Updates keep their
    // existing cookbook_id — the recipe doesn't move between
    // cookbooks on edit.
    const body = isUpdate ? draft : { ...draft, cookbookId: activeCookbookId };
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    // Cloudflare Access session expiry shows up as a transparent
    // redirect to cloudflareaccess.com — fetch follows it and
    // returns a 200 OK from the sign-in page, which would silently
    // look like a successful save. Detect that case and surface a
    // re-sign-in message instead of dropping the recipe.
    if (res.redirected || !res.url.startsWith(window.location.origin)) {
      throw new Error("Your sign-in session has expired. Refresh the page to sign in again, then re-save.");
    }
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || `Save failed (${res.status})`);
    }
    // Server returns the final id after slug-collision handling
    // (e.g. a second "Apple Pie" lands at apple-pie-2). Use that
    // when navigating so the URL matches what was actually stored.
    const result = await res.json().catch(() => ({}));
    if (!result?.id && !result?.ok) {
      // Worker always returns { ok: true, id } on success. Anything
      // else (empty body / HTML response that JSON-parsed to {}) is
      // a silent failure.
      throw new Error("Save returned no id — the recipe may not have been written. Refresh and try again.");
    }
    const savedId = result?.id || draft.id;
    if (isLegacy) setExtraRecipes(arr => arr.filter(x => x.id !== draft.id));
    await refreshRecipes();
    setRoute({ view: "recipe", recipeId: savedId, editingId: null });
    return savedId;
  };

  const onEditRecipe = (r) => {
    setEditingId(r.id);
    setView("edit");
    window.scrollTo(0, 0);
  };

  const onDeleteRecipe = async (r) => {
    if (!confirm(`Delete "${r.title}"? This can't be undone.`)) return;
    // Legacy localStorage entries never made it to D1 — strip them
    // locally instead of asking the API to delete a row that doesn't
    // exist (the cause of the "not found" some users hit).
    if (extraRecipes.some(x => x.id === r.id)) {
      setExtraRecipes(arr => arr.filter(x => x.id !== r.id));
      backToBrowse();
      return;
    }
    const res = await fetch(`/api/admin/recipes/${encodeURIComponent(r.id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      alert(error || `Delete failed (${res.status})`);
      return;
    }
    await refreshRecipes();
    backToBrowse();
  };

  // ─── Send a pairing suggestion or any draft to The Lab ───
  const onSaveToLab = (labDraft) => {
    try {
      const raw = localStorage.getItem("lab:experiments");
      const arr = raw ? JSON.parse(raw) : [];
      arr.unshift({
        id: `exp-${Date.now()}`,
        title: labDraft.title,
        blurb: labDraft.blurb || labDraft.subtitle || "",
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        chat: [],
        draft: labDraft,
      });
      localStorage.setItem("lab:experiments", JSON.stringify(arr));
    } catch {}
  };

  // ─── Tweaks ───
  const [tweaks, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  useEffect(() => {
    document.body.dataset.palette = tweaks.palette || "terracotta";
    document.body.dataset.density = tweaks.density || "comfortable";
    document.body.dataset.card = tweaks.cardLayout || "editorial";
  }, [tweaks]);

  // ─── Open recipe helper ───
  const openRecipe = (r) => { setRecipeId(r.id); setView("recipe"); window.scrollTo(0, 0); };
  const backToBrowse = () => { setView("browse"); window.scrollTo(0, 0); };

  // First landing per session: when a freshly-signed-in cook hits
  // the generic root view, drop them on the My Cookbooks index so
  // they can pick (or recognise) their default cookbook before
  // diving in. Subsequent in-tab navigation works normally, and
  // refreshing or browser-back keeps the URL they were on —
  // sessionStorage clears only when the tab closes, so the next
  // sign-in starts fresh.
  // Deep links (/recipe/<slug>, /i/<token>, /cookbooks itself,
  // etc.) bypass the redirect — if the cook explicitly went
  // somewhere, respect that.
  useEffect(() => {
    if (authLoading || !authEmail) return;
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem("session:landed")) return;
    // Wait for profile to finish loading so we don't race the
    // pending / profile-setup gates.
    if (profileLoading) return;
    if (profile?.profileComplete === false) return;
    if (profile?.status === "pending") return;
    sessionStorage.setItem("session:landed", "1");
    if (view === "browse") {
      setView("cookbooks");
    }
  }, [authLoading, authEmail, profileLoading, profile, view]);

  // Signed-out landing: if the cook isn't authenticated and isn't
  // hitting a path that has its own public surface (recipe deep
  // link, invite acceptance), render the marketing / sign-in
  // landing instead of dropping them on the empty browse view.
  // Wait for authLoading so we don't flicker the landing during
  // the initial auth probe.
  if (!authLoading && !authEmail && view !== "invite" && view !== "recipe") {
    return <SignedOutLanding />;
  }

  // Pending-approval gate: cooks signed up via the open Cloudflare
  // Access policy land here until an admin approves them.
  // Profile gate runs first so the admin sees their actual name
  // in the pending queue. Invited cooks bypass — invite-accept
  // auto-approves them.
  if (authEmail && profile && profile.profileComplete === true && profile.status === "pending" && view !== "invite") {
    return (
      <PendingApprovalGate
        authEmail={authEmail}
        refreshProfile={refreshProfile}
      />
    );
  }

  // Profile gate: signed-in cooks without first/last name on file
  // see a setup form before anything else. Skipped on the public
  // /invite/:token page so the invitee can see who invited them
  // before signing in (the gate kicks in after they accept).
  if (authEmail && profile && profile.profileComplete === false && view !== "invite") {
    return (
      <ProfileSetupGate
        authEmail={authEmail}
        save={saveProfile}
        onSaved={async () => {
          await refreshProfile();
          // Phase 4b-4: drop the new cook on the My-cookbooks index
          // so they see their freshly-bootstrapped personal +
          // family cookbooks and can hit "Members" on the family
          // one to invite their household. Patricia and other
          // pre-seeded cooks finishing the gate also land here so
          // it's a consistent first-touch.
          setView("cookbooks");
        }}
        onSignOut={SIGN_OUT_URL}
      />
    );
  }

  return (
    <>
      {/* ───── Top nav ───── */}
      <nav className="nav">
        <div className="nav-inner">
          {/* Hamburger — DOM position is FIRST so it lands on
              the left of the logo on mobile. Hidden via CSS on
              tablet/desktop. */}
          <button
            className="nav-hamburger"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Menu"
          >
            <Icon name="menu" size={22} />
            {selection.length > 0 && <span className="hamburger-badge">{selection.length}</span>}
          </button>
          <div className="brand" onClick={backToBrowse}>
            <img className="brand-logo" src="/images/heirloom-tomato-long.png" alt="Heirloom" />
            <img className="brand-mark" src="/images/heirloom-tomato-h.PNG" alt="Heirloom" />
          </div>
          <NavSearch
            query={query}
            setQuery={(v) => { setQuery(v); if (view !== "browse") setView("browse"); }}
            placeholder={t("searchPlaceholder")}
            mobilePlaceholder={t("searchPlaceholderShort")}
            simpleMode={simpleMode}
            onOpenFilters={() => setFiltersOpen(true)}
            filtersLabel={t("filters")}
            recipes={recipes}
            onOpenRecipe={openRecipe}
          />
          <div className="nav-actions">
            {FLAGS.cookbooks && authEmail && (
              <button
                type="button"
                className={`btn ghost sm nav-mycookbooks ${view === "cookbooks" || view === "cookbook" ? "active" : ""}`}
                onClick={() => setView("cookbooks")}
                title="My cookbooks"
              >
                <Icon name="book" size={15} /> <span className="btn-label">My cookbooks</span>
              </button>
            )}
            {!simpleMode && (
              <MakeDropdown
                currentView={view}
                selectionCount={selection.length}
                showLab={FLAGS.lab}
                showMeal={true}
                onOpenLab={() => setView("lab")}
                onOpenMeal={() => setView("meal")}
              />
            )}
            <button className={`btn primary sm ${view === "add" || view === "edit" ? "active" : ""}`} onClick={() => setView("add")} title={t("addRecipe")}>
              <Icon name="plus" size={15} /> <span className="btn-label">{t("addRecipe")}</span>
            </button>
            {authEmail ? (
              <AvatarMenu
                email={authEmail}
                simpleMode={simpleMode}
                isAdmin={effectiveIsAdmin}
                pendingCount={effectiveIsAdmin ? pendingCount : 0}
                notificationCount={notificationCount}
                onToggleSimpleMode={() => setSimpleMode(m => !m)}
                onMyCookbooks={() => setView("cookbooks")}
                onNotifications={() => setView("notifications")}
                onSettings={() => setView("settings")}
                onAdmin={() => setView("admin")}
              />
            ) : (
              <a className="btn sm sign-in" href={signInUrl()} title={t("signIn")}>
                <Icon name="chef" size={15} /> <span className="btn-label">{t("signIn")}</span>
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* ───── Cooking timers (sticky full-width strip under the
           nav; survives navigation so a simmer can keep ticking
           while the cook browses pairings) ───── */}
      <TimerTicker />
      <TimerBanner />

      {/* "View as" preview banner — visible while a non-admin
          role is being previewed. One-tap revert keeps the
          admin from getting stuck in the preview. */}
      {viewAsRole && isReallyAdmin && (
        <div className="view-as-banner">
          <span>
            Previewing as <strong>{viewAsRole}</strong>. Admin tools are hidden.
          </span>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setViewAsRole(null)}
          >
            Back to admin view
          </button>
        </div>
      )}

      {/* ───── Meal-selection banner (sticky under nav while items
           are queued but the cook isn't in the meal builder) ───── */}
      {selection.length > 0 && view !== "meal" && view !== "meal-plan" && (
        <div className="meal-banner">
          <span className="count">{selection.length}</span>
          <span className="label">
            {selection.length === 1 ? t("recipeOnMenu") : t("recipesOnMenu")}
          </span>
          <button
            className="btn sm"
            onClick={() => {
              // If the cook has already planned a finish time
              // for this selection, jump straight to the results
              // page. Otherwise, drop them in the meal builder
              // to pick recipes / hit Plan & cook together.
              if (mealPlan) setView("meal-plan");
              else setView("meal");
            }}
          >
            {t("reviewMeal")}
          </button>
        </div>
      )}

      {/* ───── Main views ───── */}
      {view === "browse" && (
        <Browse
          recipes={filtered}
          allRecipes={recipes}
          query={query} setQuery={setQuery}
          filters={filters} setFilters={setFilters}
          openRecipe={openRecipe}
          openFilters={() => setFiltersOpen(true)}
          selection={selection}
          toggleSelect={toggleSelect}
          selectionMode={false}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          openAddRecipe={() => setView("add")}
          openMealBuilder={() => setView("meal")}
          openLab={() => setView("lab")}
          simpleMode={simpleMode}
          activeCookbookName={effectiveUserCookbooks.find(c => c.id === activeCookbookId)?.name}
        />
      )}
      {view === "recipe" && !recipe && (
        // Recipe lookup failed — most likely because the cook
        // saved a recipe to a different cookbook than the one
        // currently active in the switcher. Tell them, with a
        // link back to browse and to swap cookbooks.
        <div style={{ padding: "80px 24px", textAlign: "center", color: "var(--ink-3)", fontFamily: "var(--serif)" }}>
          <div style={{ fontSize: 32, fontStyle: "italic", marginBottom: 12 }}>Recipe not in this cookbook.</div>
          <div style={{ marginBottom: 20, maxWidth: "36ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
            It may have been saved to a different cookbook. Try switching cookbooks in the top nav, or head back to the list.
          </div>
          <button className="btn primary" onClick={backToBrowse}>Back to cookbook</button>
        </div>
      )}
      {view === "recipe" && recipe && (
        <ErrorBoundary>
        <RecipeDetail
          recipe={recipe}
          variant={tweaks.recipeStyle}
          allRecipes={recipes}
          onBack={backToBrowse}
          onCookMode={(r, steps, ings) => openCook(r, steps, ings)}
          onShop={openShop}
          addComment={addComment}
          deleteComment={deleteComment}
          onSaveRecipe={onSaveRecipe}
          onOpenRecipe={openRecipe}
          onSaveToLab={onSaveToLab}
          authEmail={authEmail}
          profile={profile}
          onEditRecipe={onEditRecipe}
          onDeleteRecipe={onDeleteRecipe}
          onBuildMealWith={(paired) => buildMealWith(recipe, paired)}
          simpleMode={simpleMode}
          userCookbooks={effectiveUserCookbooks}
          activeCookbookId={activeCookbookId}
          onCopyToCookbook={async (destCookbookId) => {
            // POST the copy. On success, fire a bottom-of-screen
            // snackbar with the destination cookbook name as a
            // tappable link — the cook stays put on the source
            // recipe unless they explicitly tap through.
            try {
              const res = await fetch(`/api/admin/recipes/${encodeURIComponent(recipe.id)}/copy-to/${encodeURIComponent(destCookbookId)}`, {
                method: "POST",
                credentials: "include",
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || `Copy failed (${res.status})`);
              }
              const { id: newId } = await res.json();
              const destCb = effectiveUserCookbooks.find(c => c.id === destCookbookId);
              setSnackbar({
                message: "Recipe added to",
                cookbookName: destCb?.name || "the cookbook",
                onOpen: () => {
                  setActiveCookbookId(destCookbookId);
                  setTimeout(() => {
                    setRecipeId(newId);
                    setView("recipe");
                    window.scrollTo(0, 0);
                  }, 50);
                  setSnackbar(null);
                },
              });
              return { ok: true };
            } catch (err) {
              return { ok: false, error: err.message || "Could not copy." };
            }
          }}
        />
        </ErrorBoundary>
      )}
      {view === "add" && (
        <AddRecipe
          onClose={backToBrowse}
          onSave={onSaveRecipe}
          authEmail={authEmail}
          profile={profile}
          activeCookbookId={activeCookbookId}
          setActiveCookbookId={setActiveCookbookId}
          userCookbooks={effectiveUserCookbooks}
          usedCuisines={usedCuisines}
          usedAuthors={usedAuthors}
        />
      )}
      {view === "edit" && (() => {
        // IMPORTANT: read from canonicalRecipes, NOT the localized
        // `recipes` array. The editor must see the canonical
        // English fields — otherwise editing while the UI is in
        // Polish saves the Polish overlay back as the canonical
        // blob, and flipping back to English would show Polish for
        // good. (Repro: open Apple Pie in PL, edit-save, flip to EN.)
        const editingRecipe = canonicalRecipes.find(r => r.id === editingId);
        if (!editingRecipe) {
          // Defensive: the recipe id may be stale (recipe was deleted in
          // another tab, or extraRecipes got cleared). Send the user back
          // home instead of crashing.
          setTimeout(() => { setEditingId(null); setView("browse"); }, 0);
          return null;
        }
        return (
          <ErrorBoundary>
            <AddRecipe
              onClose={() => { setEditingId(null); setView("recipe"); }}
              onSave={onSaveRecipe}
              onDelete={onDeleteRecipe}
              authEmail={authEmail}
              profile={profile}
              activeCookbookId={activeCookbookId}
              setActiveCookbookId={setActiveCookbookId}
              userCookbooks={effectiveUserCookbooks}
              initialRecipe={editingRecipe}
              usedCuisines={usedCuisines}
              usedAuthors={usedAuthors}
            />
          </ErrorBoundary>
        );
      })()}
      {FLAGS.lab && view === "lab" && (
        <ExperimentationLab
          onClose={backToBrowse}
          onPromote={onSaveRecipe}
          openCook={openCook}
          allRecipes={recipes}
          authEmail={authEmail}
        />
      )}
      {FLAGS.cookbooks && view === "cookbooks" && (
        <CookbooksIndex
          authEmail={authEmail}
          isAdmin={!!profile?.isAdmin}
          activeCookbookId={activeCookbookId}
          onClose={backToBrowse}
          onOpenCookbook={(cb) => { setActiveCookbookId(cb.id); goToCookbook(cb.slug || cb.id); }}
        />
      )}
      {FLAGS.cookbooks && view === "cookbook" && (
        <CookbookPage
          cookbookSlug={cookbookSlug}
          cookbookTab={cookbookTab}
          setCookbookTab={setCookbookTab}
          authEmail={authEmail}
          isAdmin={!!profile?.isAdmin}
          setActiveCookbookId={setActiveCookbookId}
          goToLibrary={goToLibrary}
          openAddRecipe={() => setView("add")}
          renderRecipesTab={() => (
            <Browse
              recipes={filtered}
              allRecipes={recipes}
              query={query} setQuery={setQuery}
              filters={filters} setFilters={setFilters}
              openRecipe={openRecipe}
              openFilters={() => setFiltersOpen(true)}
              selection={selection}
              toggleSelect={toggleSelect}
              selectionMode={false}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              openAddRecipe={() => setView("add")}
              openMealBuilder={() => setView("meal")}
              openLab={() => setView("lab")}
              simpleMode={simpleMode}
              embedded
            />
          )}
        />
      )}
      {FLAGS.cookbooks && view === "invite" && (
        <InviteAccept
          token={inviteToken}
          authEmail={authEmail}
          onAccepted={(cookbookId) => { setActiveCookbookId(cookbookId); setView("cookbooks"); window.scrollTo(0, 0); }}
          onClose={() => setView("cookbooks")}
        />
      )}
      {view === "notifications" && (
        <Notifications
          authEmail={authEmail}
          onOpenCookbook={(cookbookId) => { setActiveCookbookId(cookbookId); setView("cookbooks"); window.scrollTo(0, 0); }}
        />
      )}
      {view === "settings" && (
        <AccountSettings
          profile={profile}
          saveProfile={saveProfile}
          refreshProfile={refreshProfile}
          onClose={backToBrowse}
        />
      )}
      {view === "admin" && (
        <AdminPage
          authEmail={authEmail}
          viewAsRole={viewAsRole}
          onSetViewAs={setViewAsRole}
          activeCookbookId={activeCookbookId}
          onOpenCookbook={(cb) => { setActiveCookbookId(cb.id); backToBrowse(); }}
          onClose={backToBrowse}
        />
      )}
      {view === "meal" && (
        <BuildAMeal
          recipes={recipes}
          selection={selection}
          toggleSelect={toggleSelect}
          clearSelection={() => setSelection([])}
          openRecipe={openRecipe}
          onClose={backToBrowse}
          onPlanMeal={openPlanMeal}
        />
      )}
      {view === "meal-plan" && mealPlan && (
        <MealPlanPage
          recipes={mealPlan.recipes}
          finishTime={mealPlan.finishTime}
          onChangeFinishTime={(t) => setMealPlan(p => ({ ...p, finishTime: t }))}
          eveningHour={mealPlan.eveningHour}
          onClose={() => setView("meal")}
          onCookMode={(r, steps, ings) => openCook(r, steps, ings)}
          onShop={openShop}
          allRecipes={recipes}
          addComment={addComment}
          deleteComment={deleteComment}
          onSaveRecipe={onSaveRecipe}
          onSaveToLab={onSaveToLab}
          onOpenRecipe={openRecipe}
          onEditRecipe={onEditRecipe}
          onDeleteRecipe={onDeleteRecipe}
          onAddToMeal={(paired) => {
            if (!paired?.id) return;
            // Add to the staged meal plan (don't re-add duplicates)
            // and the selection so the meal-banner count syncs.
            setMealPlan(p => p && p.recipes.some(r => r.id === paired.id)
              ? p
              : (p ? { ...p, recipes: [...p.recipes, paired] } : p));
            setSelection(s => s.includes(paired.id) ? s : [...s, paired.id]);
          }}
          authEmail={authEmail}
          simpleMode={simpleMode}
        />
      )}


      {/* ───── Modals & overlays ───── */}
      <ShoppingList open={shopOpen} onClose={() => setShopOpen(false)} payload={shopPayload} />

      <PlanMealModal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        recipes={planRecipes}
        onConfirm={confirmPlan}
      />

      <FiltersDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        setFilters={setFilters}
      />

      <MobileMenuDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        authEmail={authEmail}
        simpleMode={simpleMode}
        onToggleSimpleMode={() => setSimpleMode(m => !m)}
        onOpenAdd={() => setView("add")}
        onOpenMeal={() => setView("meal")}
        onOpenLab={() => setView("lab")}
        onOpenMyCookbooks={FLAGS.cookbooks ? () => setView("cookbooks") : undefined}
        onOpenNotifications={() => setView("notifications")}
        onOpenSettings={() => setView("settings")}
        onOpenAdmin={effectiveIsAdmin ? () => setView("admin") : undefined}
        isSystemAdmin={effectiveIsAdmin}
        pendingCount={effectiveIsAdmin ? pendingCount : 0}
        notificationCount={notificationCount}
        cookbooks={effectiveUserCookbooks}
        activeCookbookId={activeCookbookId}
        onSwitchCookbook={(id) => { setActiveCookbookId(id); backToBrowse(); }}
        currentView={view}
        selectionCount={selection.length}
      />

      {cookState && (
        <CookMode
          recipe={cookState.recipe}
          steps={cookState.steps}
          ingredients={cookState.ings}
          finishTime={finishTime}
          setFinishTime={setFinishTime}
          onClose={() => setCookState(null)}
          authEmail={authEmail}
          onSaveRecipe={onSaveRecipe}
        />
      )}

      {/* ───── Tweaks panel ───── */}
      <TweaksPanel title={t("tweaks")}>
        <TweakSection label="Recipe page style">
          <TweakSelect
            label="Layout"
            value={tweaks.recipeStyle}
            onChange={(v) => setTweak("recipeStyle", v)}
            options={[
              { value: "editorial", label: "Editorial — clean, sectioned" },
              { value: "magazine", label: "Magazine — full-bleed hero" },
              { value: "binder", label: "Binder — recipe-card / scrapbook" },
            ]}
          />
        </TweakSection>
        <TweakSection label="Look & feel">
          <TweakSelect
            label="Palette"
            value={tweaks.palette}
            onChange={(v) => setTweak("palette", v)}
            options={[
              { value: "terracotta", label: "Terracotta" },
              { value: "dusk", label: "Dusk" },
              { value: "forest", label: "Forest" },
            ]}
          />
          <TweakRadio
            label="Density"
            value={tweaks.density}
            onChange={(v) => setTweak("density", v)}
            options={[
              { value: "cozy", label: "Cozy" },
              { value: "comfortable", label: "Comfy" },
              { value: "compact", label: "Compact" },
            ]}
          />
          <TweakSelect
            label="Recipe cards"
            value={tweaks.cardLayout}
            onChange={(v) => setTweak("cardLayout", v)}
            options={[
              { value: "editorial", label: "Editorial" },
              { value: "index-card", label: "Index card" },
              { value: "minimal", label: "Minimal" },
            ]}
          />
        </TweakSection>
      </TweaksPanel>

      <BackToTopFab />
      <LanguageFab
        availableLangs={
          effectiveUserCookbooks.find(c => c.id === activeCookbookId)?.languages || ["en"]
        }
      />
      {snackbar && (
        <Snackbar snackbar={snackbar} onClose={() => setSnackbar(null)} />
      )}
    </>
  );
}

// Admin-only emails see extra menu entries (currently just the
// AI usage dashboard). Hard-coded for now — there's no role
// system, and the family-scoped cookbook makes a single allowlist
// fine. Add to this array if more admins need access.
const ADMIN_EMAILS = ["patricia.fejdasz@gmail.com"];

// Mobile hamburger drawer. Reorganises everything the desktop
// nav surfaces as inline buttons (Lab / Build a meal / Add
// recipe + the avatar menu) into a single slide-in sheet so the
// top bar can stay just logo + search + hamburger on narrow
// viewports.
//
// Sections (top → bottom):
//   1. Account — avatar disc with the cook's initial + email
//      address; tier badge will slot in here once Phase 4 lands.
//   2. Make — primary actions (Add recipe, Build a meal, Lab).
//   3. Settings — Simple mode toggle, admin shortcuts.
//   4. Footer — Sign in / Sign out.
// Collapsible cookbook list inside the mobile drawer. Trigger
// always shows the active cookbook + chevron; tap to expand and
// pick another. Mirrors the desktop nav-dropdown affordance in a
// touch-friendly stacked-list shape.
function CookbookSubmenu({ cookbooks, activeCookbookId, onSwitchCookbook, onOpenMyCookbooks, go }) {
  const [open, setOpen] = useState(false);
  const active = cookbooks.find(c => c.id === activeCookbookId) || cookbooks[0];
  return (
    <>
      <button
        type="button"
        className={`mobile-menu-item cookbook-submenu-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <Icon name="book" size={18} />
        <span>{active?.name || "Cookbook"}</span>
        <span className={`chev ${open ? "open" : ""}`} aria-hidden>›</span>
      </button>
      {open && (
        <div className="cookbook-submenu">
          {onOpenMyCookbooks && (
            <button
              type="button"
              className="mobile-menu-item submenu-item manage"
              onClick={() => go(onOpenMyCookbooks)}
            >
              <span>Cookbooks →</span>
            </button>
          )}
          {cookbooks.map(cb => (
            <button
              key={cb.id}
              type="button"
              className={`mobile-menu-item submenu-item ${cb.id === activeCookbookId ? "active" : ""}`}
              onClick={() => go(() => onSwitchCookbook(cb.id))}
            >
              <span>{cb.name}</span>
              {cb.id === activeCookbookId && <span className="badge">on</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function MobileMenuDrawer({
  open, onClose,
  authEmail, simpleMode, onToggleSimpleMode,
  onOpenAdd, onOpenMeal, onOpenLab,
  onOpenMyCookbooks, onOpenNotifications, onOpenSettings, onOpenAdmin,
  isSystemAdmin, pendingCount = 0, notificationCount = 0,
  cookbooks = [], activeCookbookId, onSwitchCookbook,
  currentView,
  selectionCount,
}) {
  const { t } = useLang();
  const isAdmin = authEmail && ADMIN_EMAILS.includes(authEmail);
  const initial = (authEmail?.[0] || "?").toUpperCase();
  const go = (fn) => { onClose(); fn?.(); };
  if (!open) return null;
  return (
    <>
      <div className="mobile-menu-scrim" onClick={onClose} />
      <aside className="mobile-menu" role="dialog" aria-label="Menu">
        <header className="mobile-menu-head">
          {authEmail ? (
            <>
              <div className="mobile-menu-avatar" aria-hidden>{initial}</div>
              <div className="mobile-menu-identity">
                <div className="email">{authEmail}</div>
                <div className="sub">{t("signedIn") || "Signed in"}</div>
              </div>
            </>
          ) : (
            <div className="mobile-menu-identity">
              <div className="email">{t("notSignedIn") || "Not signed in"}</div>
            </div>
          )}
          <button className="mobile-menu-close" onClick={onClose} aria-label="Close menu">
            <Icon name="x" size={18} />
          </button>
        </header>

        {/* Cookbook switcher — replaces the top-nav inline dropdown
            on mobile (hidden via CSS at this breakpoint). Collapsible:
            the trigger always shows the active cookbook name; tap
            to expand and pick another. Renders only when the cook
            is a member of 2+ cookbooks. */}
        {authEmail && cookbooks && cookbooks.length >= 1 && onSwitchCookbook && (
          <section className="mobile-menu-section">
            <div className="mobile-menu-section-title">Cookbook</div>
            <CookbookSubmenu
              cookbooks={cookbooks}
              activeCookbookId={activeCookbookId}
              onSwitchCookbook={onSwitchCookbook}
              onOpenMyCookbooks={onOpenMyCookbooks}
              go={go}
            />
          </section>
        )}

        {!simpleMode && (
          <section className="mobile-menu-section">
            <div className="mobile-menu-section-title">{t("make") || "Make"}</div>
            <button className={`mobile-menu-item primary ${currentView === "add" || currentView === "edit" ? "active" : ""}`} onClick={() => go(onOpenAdd)}>
              <Icon name="plus" size={18} />
              <span>{t("addRecipe")}</span>
            </button>
            <button className={`mobile-menu-item ${currentView === "meal" || currentView === "meal-plan" ? "active" : ""}`} onClick={() => go(onOpenMeal)}>
              <Icon name="build" size={18} />
              <span>{t("buildMeal")}</span>
              {selectionCount > 0 && <span className="badge">{selectionCount}</span>}
            </button>
            {FLAGS.lab && (
              <button className={`mobile-menu-item ${currentView === "lab" ? "active" : ""}`} onClick={() => go(onOpenLab)}>
                <Icon name="experiment" size={18} />
                <span>{t("theLab")}</span>
              </button>
            )}
          </section>
        )}

        {authEmail && (
          <section className="mobile-menu-section">
            <div className="mobile-menu-section-title">{t("settings") || "Settings"}</div>
            {onOpenMyCookbooks && (
              <button className={`mobile-menu-item ${currentView === "cookbooks" ? "active" : ""}`} onClick={() => go(onOpenMyCookbooks)}>
                <Icon name="book" size={18} />
                <span>Cookbooks</span>
              </button>
            )}
            {onOpenNotifications && (
              <button className={`mobile-menu-item ${currentView === "notifications" ? "active" : ""}`} onClick={() => go(onOpenNotifications)}>
                <Icon name="comment" size={18} />
                <span>Notifications</span>
                {notificationCount > 0 && <span className="badge">{notificationCount}</span>}
              </button>
            )}
            {onOpenSettings && (
              <button className={`mobile-menu-item ${currentView === "settings" ? "active" : ""}`} onClick={() => go(onOpenSettings)}>
                <Icon name="edit" size={18} />
                <span>Account settings</span>
              </button>
            )}
            <button className="mobile-menu-item" onClick={() => go(onToggleSimpleMode)}>
              <Icon name="simpleView" size={18} />
              <span>{simpleMode ? t("simpleModeOn") : t("simpleModeOff")}</span>
            </button>
            {isSystemAdmin && onOpenAdmin && (
              <button className={`mobile-menu-item ${currentView === "admin" ? "active" : ""}`} onClick={() => go(onOpenAdmin)}>
                <Icon name="chef" size={18} />
                <span>Admin</span>
                {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
              </button>
            )}
          </section>
        )}

        <footer className="mobile-menu-foot">
          {authEmail ? (
            <a className="mobile-menu-item" href={SIGN_OUT_URL}>
              <Icon name="chef" size={18} />
              <span>{t("signOut")}</span>
            </a>
          ) : (
            <a className="mobile-menu-item sign-in-cta" href={signInUrl()}>
              <Icon name="chef" size={18} />
              <span>{t("signIn")}</span>
            </a>
          )}
        </footer>
      </aside>
    </>
  );
}

function AvatarMenu({ email, simpleMode, isAdmin: isSystemAdmin, pendingCount = 0, notificationCount = 0, onToggleSimpleMode, onMyCookbooks, onNotifications, onSettings, onAdmin }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const initial = (email[0] || "?").toUpperCase();
  const { t } = useLang();
  // Legacy email-based admin allowlist still gates the AI-usage
  // entry. The new isSystemAdmin prop (from users.is_admin) gates
  // the user-management entry — they may overlap or not.
  const isAdmin = ADMIN_EMAILS.includes(email);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  // Items rendered as buttons need the same look-and-feel as the
  // <a> below — easier to keep style overrides in one place.
  const itemBtnStyle = { background: "none", border: 0, textAlign: "left", width: "100%", cursor: "pointer", font: "inherit", color: "inherit" };

  return (
    <div className="avatar-menu" ref={ref}>
      <button
        className="avatar"
        onClick={() => setOpen(o => !o)}
        title={
          pendingCount > 0
            ? `${pendingCount} pending approval${pendingCount === 1 ? "" : "s"}`
            : notificationCount > 0
              ? `${notificationCount} new notification${notificationCount === 1 ? "" : "s"}`
              : email
        }
        aria-label="Menu"
      >
        {initial}
        {(pendingCount + notificationCount) > 0 && (
          <span className="avatar-badge" aria-label={`${pendingCount + notificationCount} pending`}>{pendingCount + notificationCount}</span>
        )}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="label">{email}</div>
          {FLAGS.cookbooks && onMyCookbooks && (
            <button
              type="button"
              className="item"
              onClick={() => { setOpen(false); onMyCookbooks(); }}
              style={itemBtnStyle}
            >
              Cookbooks
            </button>
          )}
          {onNotifications && (
            <button
              type="button"
              className="item"
              onClick={() => { setOpen(false); onNotifications(); }}
              style={itemBtnStyle}
            >
              Notifications
              {notificationCount > 0 && (
                <span className="menu-item-badge">{notificationCount}</span>
              )}
            </button>
          )}
          {onSettings && (
            <button
              type="button"
              className="item"
              onClick={() => { setOpen(false); onSettings(); }}
              style={itemBtnStyle}
            >
              Account settings
            </button>
          )}
          {isSystemAdmin && onAdmin && (
            <button
              type="button"
              className="item"
              onClick={() => { setOpen(false); onAdmin(); }}
              style={itemBtnStyle}
            >
              Admin
              {pendingCount > 0 && (
                <span className="menu-item-badge">{pendingCount}</span>
              )}
            </button>
          )}
          <button
            type="button"
            className="item"
            onClick={() => { setOpen(false); onToggleSimpleMode?.(); }}
            style={itemBtnStyle}
          >
            {simpleMode ? t("simpleModeOn") : t("simpleModeOff")}
          </button>
          <a className="item" href={SIGN_OUT_URL}>{t("signOut")}</a>
        </div>
      )}
    </div>
  );
}

// Back-to-top FAB. Sits above the language flag in the bottom-
// right; shows only after the page has been scrolled enough that
// the cook would actually benefit from a jump back to the top
// (>= one viewport). Smooth-scrolls on tap.
// Simple bottom-of-screen snackbar with one optional inline link.
// Used by the "Add to cookbook" flow to confirm the copy and let
// the cook jump into the destination cookbook if they want to,
// without forcing them off the source recipe.
function Snackbar({ snackbar, onClose }) {
  return (
    <div className="snackbar" role="status" aria-live="polite">
      <span className="msg">
        {snackbar.message}{" "}
        {snackbar.onOpen ? (
          <button type="button" className="link" onClick={snackbar.onOpen}>
            {snackbar.cookbookName}
          </button>
        ) : (
          <strong>{snackbar.cookbookName}</strong>
        )}
      </span>
      <button type="button" className="dismiss" onClick={onClose} aria-label="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function BackToTopFab() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > Math.max(400, window.innerHeight * 0.6));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button
      className="back-to-top-fab"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      title="Back to top"
    >
      {/* Botanical curl with leaf accent + chevron pointing up.
          (User-supplied glyph, mirrored vertically so the arrow
          points up instead of down.) */}
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
           fill="none" stroke="currentColor" strokeWidth="1.4"
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21 C13.5 18.5 11 16 12.5 13.5 C14 11 11 9 12 6" />
        <path d="M13.2 15.5 C15.5 16 17.5 15.2 17.8 13 C15.5 12.8 13.5 13.5 13.2 15.5 Z" />
        <path d="M8.5 8 L12 4.5 L15.5 8" />
      </svg>
    </button>
  );
}

// Flag bitmaps for each supported language. Served from the
// public bundle so they cache cleanly and survive React rerenders.
// Width/height match the SVG dimensions the FAB used to render so
// the layout (and the round outline in the menu rows) is identical.
const FLAG_SRC = {
  en: "/images/flags/en.png",
  pl: "/images/flags/pl.jpg",
  es: "/images/flags/es.png",
  el: "/images/flags/el.jpg",
  pt: "/images/flags/pt.png",
};
const FlagImg = ({ code }) => (
  <img
    src={FLAG_SRC[code] || FLAG_SRC.en}
    alt=""
    width="22"
    height="14"
    aria-hidden="true"
    style={{ objectFit: "cover", display: "block" }}
  />
);

function LanguageFab({ availableLangs = ["en"] }) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  // If the active cookbook only has one language, the FAB has
  // nothing to switch to. Hide it.
  if (!availableLangs || availableLangs.length < 2) return null;

  // useLang is backed by useStorage; React state copies don't
  // propagate live across siblings. A reload is the simplest way
  // to re-render every surface with the new language.
  const switchTo = (code) => {
    if (code === lang) { setOpen(false); return; }
    setLang(code);
    setTimeout(() => window.location.reload(), 50);
  };

  // Two-language cookbooks → single-tap toggle (no menu).
  if (availableLangs.length === 2) {
    const other = availableLangs.find(l => l !== lang) || availableLangs[0];
    return (
      <button
        className="lang-fab"
        onClick={() => switchTo(other)}
        aria-label={`Switch to ${LANG_META[other]?.label || other}`}
        title={`Switch to ${LANG_META[other]?.label || other}`}
      >
        <FlagImg code={other} />
      </button>
    );
  }

  // 3-language cookbooks → popup menu with the languages.
  return (
    <div className="lang-fab-wrap" ref={ref}>
      {open && (
        <div className="lang-fab-menu" role="menu">
          {availableLangs.map(code => (
            <button
              key={code}
              type="button"
              className={`lang-fab-menu-item ${code === lang ? "active" : ""}`}
              onClick={() => switchTo(code)}
            >
              <span className="flag"><FlagImg code={code} /></span>
              <span className="label">{LANG_META[code]?.label || code}</span>
              {code === lang && <span className="dot" aria-hidden>•</span>}
            </button>
          ))}
        </div>
      )}
      <button
        className="lang-fab"
        onClick={() => setOpen(o => !o)}
        aria-label="Switch language"
        title="Switch language"
      >
        <FlagImg code={lang} />
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

