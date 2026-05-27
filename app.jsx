// Main app — router, top nav, tweaks panel, modal hosts.

const { useState, useEffect, useMemo } = React;

function App() {
  // ─── View routing ───
  // view: "browse" | "recipe" | "add" | "meal"
  const [view, setView] = useState("browse");
  const [recipeId, setRecipeId] = useState(null);

  // ─── Recipe collection ───
  const [extraRecipes, setExtraRecipes] = useStorage("recipes:added", []);
  const recipes = useMemo(() => [...extraRecipes, ...window.RECIPES], [extraRecipes]);
  const recipe = recipes.find(r => r.id === recipeId);

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

  // ─── Favorites ("the ones we keep coming back to") ───
  const [favorites, setFavorites] = useStorage("recipes:favorites", [
    "prime-rib",
    "ryszards-tomato-soup",
    "krystyna-apple-meringue-pie",
  ]);
  const toggleFavorite = (id) => {
    setFavorites(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

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
  const confirmPlan = (when) => {
    setFinishTime(when);
    setMealPlan({ recipes: planRecipes, finishTime: when });
    setPlanModalOpen(false);
    setView("meal-plan");
    window.scrollTo(0, 0);
  };

  // ─── User-added comments (per-recipe) ───
  const [allComments, setAllComments] = useStorage("recipes:comments", {});
  const addComment = (rid, c) => {
    setAllComments(a => ({ ...a, [rid]: [...(a[rid] || []), c] }));
  };

  // ─── Save a new recipe from Add flow ───
  const onSaveRecipe = (draft) => {
    setExtraRecipes(arr => [draft, ...arr]);
    setView("recipe");
    setRecipeId(draft.id);
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
  const { Tweak, TweaksPanel, TweakSection, TweakRadio, TweakSelect, useTweaks } = window;
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
            <img className="brand-logo-long" src="images/heirloom-tomato-long.png" alt="Heirloom" />
            <img className="brand-logo-icon" src="images/heirloom-tomato.png" alt="Heirloom" />
          </div>
          <div className="search">
            <Icon name="search" />
            <input
              placeholder="Search by recipe, cook, cuisine, or ingredient…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (view !== "browse") setView("browse"); }}
            />
            {query && <button className="btn ghost icon-only" onClick={() => setQuery("")}><Icon name="x" size={12} /></button>}
            <button
              className="btn ghost icon-only search-filter-btn"
              onClick={() => setFiltersOpen(true)}
              title="Filters"
              aria-label="Filters"
            >
              <Icon name="filter" size={14} />
            </button>
          </div>
          <div className="nav-actions">
            <button className="btn ghost sm" onClick={() => setView("lab")} title="Kitchen experimentation">
              <Icon name="sparkle" size={13} /> <span className="btn-label">The Lab</span>
            </button>
            <button className="btn ghost sm" onClick={() => setView("meal")} title="Build a meal">
              <Icon name="bowl" size={13} /> <span className="btn-label">Build a meal</span>
              {selection.length > 0 && <span style={{ marginLeft: 4, padding: "1px 6px", background: "var(--accent)", color: "var(--paper)", borderRadius: 999, fontSize: 10, fontWeight: 600 }}>{selection.length}</span>}
            </button>
            <button className="btn primary sm" onClick={() => setView("add")} title="Add recipe">
              <Icon name="plus" size={13} /> <span className="btn-label">Add recipe</span>
            </button>
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
        <RecipeDetail
          recipe={recipe}
          variant={tweaks.recipeStyle}
          allRecipes={recipes}
          onBack={backToBrowse}
          onCookMode={(r, steps, ings) => openCook(r, steps, ings)}
          onShop={openShop}
          comments={allComments[recipe.id] || []}
          addComment={addComment}
          onSaveRecipe={onSaveRecipe}
          onOpenRecipe={openRecipe}
          onSaveToLab={onSaveToLab}
        />
      )}
      {view === "add" && (
        <AddRecipe onClose={backToBrowse} onSave={onSaveRecipe} />
      )}
      {view === "lab" && (
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
            {selection.length === 1 ? "recipe" : "recipes"} on the menu
          </span>
          <button className="btn sm" style={{ background: "rgba(255,255,255,.12)", color: "var(--paper)", borderColor: "rgba(255,255,255,.2)" }} onClick={() => setView("meal")}>
            Review meal
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
        />
      )}

      {/* ───── Tweaks panel ───── */}
      <TweaksPanel title="Tweaks">
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
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
