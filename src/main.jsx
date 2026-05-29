// Main app — router, top nav, tweaks panel, modal hosts.

import { useState, useEffect, useMemo, useRef } from "react";
import ReactDOM from "react-dom/client";
import { Icon, useStorage, useRecipes, useAuth, useFavorites, signInUrl, SIGN_OUT_URL, applyFilters, normalizeRecipe, localizeRecipe, ErrorBoundary } from "./helpers.jsx";
import { useLang } from "./i18n.js";
import { FLAGS } from "./config/flags.js";
import { TweaksPanel, TweakSection, TweakRadio, TweakSelect, useTweaks } from "./tweaks-panel.jsx";
import { FiltersDrawer } from "./filters.jsx";
import { Browse } from "./browse.jsx";
import { RecipeDetail } from "./recipe.jsx";
import { AddRecipe } from "./add-recipe.jsx";
import { ExperimentationLab } from "./experiment.jsx";
import { BuildAMeal } from "./meal.jsx";
import { PlanMealModal, MealPlanPage } from "./meal-plan.jsx";
import { ShoppingList } from "./shopping.jsx";
import { CookMode } from "./cook-mode.jsx";

function App() {
  // ─── View routing ───
  // view: "browse" | "recipe" | "add" | "edit" | "meal"
  // View routing persists in sessionStorage so a refresh keeps you on
  // the recipe / meal-plan / edit page you were on. localStorage would
  // outlive the browser session, which is undesirable here — we don't
  // want to drop returning visitors straight into the last recipe
  // they opened days ago.
  const [view, setView] = useStorage("nav:view", "browse");
  const [recipeId, setRecipeId] = useStorage("nav:recipeId", null);
  const [editingId, setEditingId] = useStorage("nav:editingId", null);

  // ─── Recipe collection ───
  // Server-of-record is the D1 cookbook via /api/recipes; useRecipes caches
  // the response in localStorage so the site loads instantly for returning
  // visitors. `extraRecipes` is the legacy per-device list from before the
  // shared backend — merged in so old additions don't disappear.
  const { recipes: serverRecipes, refresh: refreshRecipes } = useRecipes();
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

  // ─── Language (English / Polish) ───
  // currentLang above is from the same hook; pulling the rest of the
  // helpers here so the localised data flows from one source.
  const { t, tDiet, tOccasion, tCourse } = useLang();

  // ─── Sign-in state ───
  const { email: authEmail } = useAuth();

  // ─── Search / filter ───
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    courses: [], diets: [], occasions: [],
    authors: [], cuisines: [], difficulties: [],
    maxTime: 0,
  });
  const filtered = useMemo(() => applyFilters(recipes, { q: query, ...filters }), [recipes, query, filters]);

  const [filtersOpen, setFiltersOpen] = useState(false);

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
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || `Save failed (${res.status})`);
    }
    if (isLegacy) setExtraRecipes(arr => arr.filter(x => x.id !== draft.id));
    await refreshRecipes();
    setView("recipe");
    setRecipeId(draft.id);
    setEditingId(null);
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

  return (
    <>
      {/* ───── Top nav ───── */}
      <nav className="nav">
        <div className="nav-inner">
          <div className="brand" onClick={backToBrowse}>
            <img className="brand-logo" src="images/heirloom-tomato-long.png" alt="Heirloom" />
            <img className="brand-mark" src="images/heirloom-tomato-h.PNG" alt="Heirloom" />
          </div>
          <div className="search">
            <Icon name="search" />
            <input
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (view !== "browse") setView("browse"); }}
            />
            {query && <button className="btn ghost icon-only" onClick={() => setQuery("")}><Icon name="x" size={12} /></button>}
            <button
              className="btn ghost icon-only search-filter-btn"
              onClick={() => setFiltersOpen(true)}
              title={t("filters")}
              aria-label={t("filters")}
            >
              <Icon name="filter" size={14} />
            </button>
          </div>
          <div className="nav-actions">
            {FLAGS.lab && (
            <button className="btn ghost sm" onClick={() => setView("lab")} title={t("kitchenExp")}>
              <Icon name="sparkle" size={13} /> <span className="btn-label">{t("theLab")}</span>
            </button>
            )}
            <button className="btn ghost sm" onClick={() => setView("meal")} title={t("buildMeal")}>
              <Icon name="bowl" size={13} /> <span className="btn-label">{t("buildMeal")}</span>
              {selection.length > 0 && <span style={{ marginLeft: 4, padding: "1px 6px", background: "var(--accent)", color: "var(--paper)", borderRadius: 999, fontSize: 10, fontWeight: 600 }}>{selection.length}</span>}
            </button>
            <button className="btn primary sm" onClick={() => setView("add")} title={t("addRecipe")}>
              <Icon name="plus" size={13} /> <span className="btn-label">{t("addRecipe")}</span>
            </button>
            {authEmail ? (
              <AvatarMenu email={authEmail} />
            ) : (
              <a className="btn sm sign-in" href={signInUrl()} title={t("signIn")}>
                <Icon name="chef" size={13} /> <span className="btn-label">{t("signIn")}</span>
              </a>
            )}
          </div>
        </div>
      </nav>

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
        />
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
          onEditRecipe={onEditRecipe}
          onDeleteRecipe={onDeleteRecipe}
          onBuildMealWith={(paired) => buildMealWith(recipe, paired)}
        />
        </ErrorBoundary>
      )}
      {view === "add" && (
        <AddRecipe onClose={backToBrowse} onSave={onSaveRecipe} authEmail={authEmail} usedCuisines={usedCuisines} usedAuthors={usedAuthors} />
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
          allRecipes={recipes}
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
          onShop={openShop}
          onPlanMeal={openPlanMeal}
        />
      )}
      {view === "meal-plan" && mealPlan && (
        <MealPlanPage
          recipes={mealPlan.recipes}
          finishTime={mealPlan.finishTime}
          eveningHour={mealPlan.eveningHour}
          onClose={() => setView("meal")}
          onCookMode={(r, steps, ings) => openCook(r, steps, ings)}
          onShop={openShop}
        />
      )}

      {/* ───── Floating shopping bar when meal selection has items but you're elsewhere ───── */}
      {selection.length > 0 && view !== "meal" && (
        <div className="meal-tray">
          <span className="count">{selection.length}</span>
          <span style={{ fontSize: 13 }}>
            {selection.length === 1 ? t("recipeOnMenu") : t("recipesOnMenu")}
          </span>
          <button className="btn sm" style={{ background: "rgba(255,255,255,.12)", color: "var(--paper)", borderColor: "rgba(255,255,255,.2)" }} onClick={() => setView("meal")}>
            {t("reviewMeal")}
          </button>
        </div>
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

      {cookState && (
        <CookMode
          recipe={cookState.recipe}
          steps={cookState.steps}
          ingredients={cookState.ings}
          finishTime={finishTime}
          setFinishTime={setFinishTime}
          onClose={() => setCookState(null)}
          authEmail={authEmail}
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

      <LanguageFab />
    </>
  );
}

function AvatarMenu({ email }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const initial = (email[0] || "?").toUpperCase();
  const { t } = useLang();

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  return (
    <div className="avatar-menu" ref={ref}>
      <button className="avatar" onClick={() => setOpen(o => !o)} title={email} aria-label="Menu">
        {initial}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="label">{email}</div>
          <a className="item" href={SIGN_OUT_URL}>{t("signOut")}</a>
        </div>
      )}
    </div>
  );
}

function LanguageFab() {
  const { lang, setLang, t } = useLang();
  const isPolish = lang === "pl";
  const next = isPolish ? "en" : "pl";
  // useLang() is backed by useStorage, which means each component that
  // calls it gets an independent React state copy. Persisting to
  // localStorage works but live updates don't propagate across the
  // tree on toggle, so a full reload is the simplest way to flip every
  // surface in one beat. View routing now persists too, so the user
  // lands back on the same page.
  const flipLanguage = () => {
    setLang(next);
    // Defer reload one tick so localStorage is committed first.
    setTimeout(() => window.location.reload(), 50);
  };
  // Polish flag (white over red) shows when site is English (tap to switch
  // to Polish); Canadian (white red maple) shows when site is Polish.
  const PolishFlag = (
    <svg viewBox="0 0 60 38" width="22" height="14" aria-hidden="true">
      <rect width="60" height="19" fill="#fff" />
      <rect y="19" width="60" height="19" fill="#dc143c" />
    </svg>
  );
  const CanadianFlag = (
    <svg viewBox="0 0 60 30" width="22" height="14" aria-hidden="true">
      <rect width="20" height="30" fill="#d52b1e" />
      <rect x="20" width="20" height="30" fill="#fff" />
      <rect x="40" width="20" height="30" fill="#d52b1e" />
      <path d="M30 8 L31.5 11.5 L34.5 11 L33 14 L36 15 L33.5 17 L34 19 L31 18.5 L30.5 21 L30 21 L29.5 21 L29 18.5 L26 19 L26.5 17 L24 15 L27 14 L25.5 11 L28.5 11.5 Z" fill="#d52b1e" />
    </svg>
  );
  return (
    <button
      className="lang-fab"
      onClick={flipLanguage}
      aria-label={isPolish ? t("switchToEN") : t("switchToPL")}
      title={isPolish ? t("switchToEN") : t("switchToPL")}
    >
      {isPolish ? CanadianFlag : PolishFlag}
    </button>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

