// Browse / home page — the first thing the user sees.

import { useState, useEffect, useRef } from "react";
import { Icon, Pill, fmtDuration, recipeSuggestions } from "./helpers.jsx";

// Home masthead search bar — always expanded (no collapse) and
// shows predictive matches in a dropdown while typing. Uses the
// shorter placeholder on narrow viewports so the long
// description doesn't get cut off mid-word.
function HomeSearch({ query, setQuery, openFilters, recipes, onOpenRecipe, placeholder, mobilePlaceholder, filtersLabel }) {
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef(null);
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 640px)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const h = (e) => setIsNarrow(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  useEffect(() => {
    if (!focused) return;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setFocused(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [focused]);
  const suggestions = focused ? recipeSuggestions(query, recipes) : [];
  const ph = isNarrow && mobilePlaceholder ? mobilePlaceholder : placeholder;
  return (
    <div className="search-wrap home-search-wrap" ref={wrapRef}>
      <div className="search home-search">
        <Icon name="search" />
        <input
          placeholder={ph}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
        />
        {query && <button className="btn ghost icon-only" onClick={() => setQuery("")}><Icon name="x" size={14} /></button>}
        <button
          className="btn ghost icon-only search-filter-btn"
          onClick={openFilters}
          title={filtersLabel}
          aria-label={filtersLabel}
        >
          <Icon name="filter" size={16} />
        </button>
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

import { useLang } from "./i18n.js";
import { DIET_ICON } from "./data.js";

export function RecipeCard({ recipe, onOpen, selected, selectIdx, onToggleSelect, selectionMode, isFavorite, onToggleFavorite }) {
  const { t, tDiet, tOccasion, tDifficulty } = useLang();
  const handleCardClick = (e) => {
    // Defensive — even if the heart's stopPropagation didn't fire on
    // iOS (target can be an inner SVG/path), bail when the tap lands
    // anywhere inside the heart.
    if (e.target.closest && e.target.closest(".fave")) return;
    if (selectionMode) onToggleSelect(recipe); else onOpen(recipe);
  };
  const handleFaveClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite(recipe.id);
  };
  return (
    <div
      className={`card ${selected ? "selected" : ""}`}
      onClick={handleCardClick}
      data-screen-label={recipe.title}>

      <div className="photo" style={{ backgroundImage: `url(${recipe.photoCard || recipe.photo})` }}>
        <div className="ribbon">{recipe.course}</div>
        {!selectionMode && onToggleFavorite &&
        <button
          type="button"
          className={`fave ${isFavorite ? "on" : "off"}`}
          onClick={handleFaveClick}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          aria-label={isFavorite ? t("removeFromFavorites") : t("addToFavorites")}
          aria-pressed={isFavorite}>
          <Icon name={isFavorite ? "heartFill" : "heart"} size={15} />
        </button>
        }
        {selectionMode && selected &&
        <div className="select-mark">{selectIdx + 1}</div>
        }
      </div>
      <div className="body">
        <div className="author">{t("by")} {recipe.author}</div>
        <div className="title">{recipe.title}</div>
        <div className="sub">{recipe.subtitle}</div>
        <div className="tags">
          {recipe.origin && (
            <span className="recipe-tag origin" data-origin={recipe.origin} style={{ fontSize: 10, padding: "3px 8px" }}>
              <Icon name={recipe.origin === "heirloom" ? "tomato" : recipe.origin === "newToFamily" ? "sprout" : "beaker"} size={15} />
            </span>
          )}
          {recipe.diet.slice(0, 2).map((d) => (
            <Pill key={d} kind="olive">
              {DIET_ICON[d] && <Icon name={DIET_ICON[d]} size={15} />} {tDiet(d)}
            </Pill>
          ))}
          <Pill kind="slate">{recipe.cuisine}</Pill>
        </div>
        <div className="footer">
          <span className="cook-time">
            <Icon name="clock" size={12} /> {fmtDuration(recipe.total)}
          </span>
          <span>
            {(() => {
              // Average rating from family-posted notes (ignore notes
              // without a rating). Shows occasion alone when there are
              // no rated notes yet.
              const rated = (recipe.liveComments || []).filter(c => c.rating > 0);
              const occasion = tOccasion(recipe.occasion);
              if (rated.length === 0) return occasion;
              const avg = rated.reduce((s, c) => s + c.rating, 0) / rated.length;
              return <><Icon name="starFill" size={12} /> {avg.toFixed(1)} · {occasion}</>;
            })()}
          </span>
        </div>
      </div>
    </div>);

}

// Render a cookbook name as the masthead title — italicises the
// most evocative word ("Family" in "Heirloom Family Cookbook",
// "Cookbook" in "Patricia's Cookbook") so the editorial typography
// keeps the same rhythm as the default "The Family Cookbook" did.
export function renderCookbookTitle(name) {
  if (!name) return null;
  const words = name.split(/\s+/);
  // Find the index of the word to italicise: prefer "Family",
  // else "Cookbook", else the last word.
  const familyIdx = words.findIndex(w => /^family/i.test(w));
  const cookbookIdx = words.findIndex(w => /^cookbook$/i.test(w));
  const i = familyIdx >= 0 ? familyIdx : (cookbookIdx >= 0 ? cookbookIdx : words.length - 1);
  return (
    <>
      {words.slice(0, i).join(" ")}{i > 0 ? " " : ""}
      <em style={{ color: "var(--accent)" }}>{words[i]}</em>
      {i < words.length - 1 ? " " : ""}{words.slice(i + 1).join(" ")}
    </>
  );
}

export function Browse({ recipes, allRecipes, query, setQuery, filters, setFilters, openRecipe, openFilters, selection, toggleSelect, selectionMode, favorites = [], toggleFavorite, openAddRecipe, openMealBuilder, openLab, simpleMode, activeCookbookName, canWriteActive = true, embedded = false }) {
  const { t, tCourse, tOccasion, tDiet, tOrigin, lang } = useLang();

  // Active filter chips — origins lead the row because it's the
  // broadest cut (heirloom / new / lab).
  const activeChips = [];
  for (const k of ["origins", "courses", "diets", "occasions", "authors", "cuisines", "difficulties"]) {
    for (const v of filters[k] || []) activeChips.push({ k, v });
  }
  if (filters.maxTime) activeChips.push({ k: "maxTime", v: `≤ ${fmtDuration(filters.maxTime)}` });

  const removeChip = (k, v) => {
    setFilters((f) => ({ ...f, [k]: k === "maxTime" ? 0 : f[k].filter((x) => x !== v) }));
  };

  // Group recipes by favorites set, then everything else
  const favSet = new Set(favorites);
  const favs = recipes.filter((r) => favSet.has(r.id));
  const rest = recipes.filter((r) => !favSet.has(r.id));
  const showingAll = !query && activeChips.length === 0;

  const cardProps = (r) => ({
    key: r.id,
    recipe: r,
    onOpen: openRecipe,
    selected: selection.includes(r.id),
    selectIdx: selection.indexOf(r.id),
    onToggleSelect: toggleSelect,
    selectionMode,
    isFavorite: favSet.has(r.id),
    onToggleFavorite: toggleFavorite,
  });

  return (
    <div className="app" data-screen-label="01 Browse">
      {/* Editorial masthead — hidden when Browse is embedded inside
          the new cookbook page (cookbook page renders its own
          title + actions; the search/add/build-a-meal row will
          come back as separate surfaces later). */}
      {!embedded && (
        <header className="home-masthead">
          <h1 className="home-title">
            {activeCookbookName
              ? renderCookbookTitle(activeCookbookName)
              : lang === "pl"
                ? <><em style={{ color: "var(--accent)" }}>Rodzinna</em> Książka Kucharska</>
                : <>The <em style={{ color: "var(--accent)" }}>Family</em> Cookbook</>}
          </h1>
          <div className="home-search-row">
            <HomeSearch
              query={query}
              setQuery={setQuery}
              openFilters={openFilters}
              recipes={allRecipes || []}
              onOpenRecipe={openRecipe}
              placeholder={t("searchPlaceholder")}
              mobilePlaceholder={t("searchPlaceholderShort")}
              filtersLabel={t("filters")}
            />
            {canWriteActive && (
              <button className="btn primary" onClick={openAddRecipe}><Icon name="plus" /> {t("addRecipe")}</button>
            )}
            {!simpleMode && (
              <button className="btn" onClick={openMealBuilder}><Icon name="build" /> {t("buildMeal")}</button>
            )}
          </div>
        </header>
      )}

      {/* Active filters */}
      {activeChips.length > 0 &&
      <div className="filterbar">
          <span className="label">{t("filteringBy")}</span>
          {activeChips.map((c) => {
            // Display label gets translated through the right table by key
            const display = c.k === "courses" ? tCourse(c.v)
              : c.k === "occasions" ? tOccasion(c.v)
              : c.k === "diets" ? tDiet(c.v)
              : c.k === "origins" ? tOrigin(c.v)
              : c.v;
            return (
              <button key={`${c.k}-${c.v}`} className="filter-pill on" onClick={() => removeChip(c.k, c.v)}>
                {display} <Icon name="x" size={12} />
              </button>
            );
          })}
          <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setFilters({ courses: [], diets: [], occasions: [], authors: [], cuisines: [], difficulties: [], origins: [], maxTime: 0 })}>
            {t("clearAll")}
          </button>
        </div>
      }

      {/* Section: showing-all → favorites then rest. Otherwise: flat. */}
      {showingAll && (allRecipes || []).length === 0 ? (
        <div className="empty-cookbook">
          <Icon name="book" size={48} />
          <div className="t">No recipes here yet.</div>
          <div className="s">
            {canWriteActive
              ? "This cookbook is empty. Add the first recipe to get started."
              : "This cookbook is empty. Only owners and editors can add recipes — ask whoever invited you."}
          </div>
          {canWriteActive && (
            <button className="btn primary" onClick={openAddRecipe}>
              <Icon name="plus" size={14} /> Add a recipe
            </button>
          )}
        </div>
      ) : showingAll ?
      <>
          {favs.length > 0 && <>
          <div className="section-head" style={{ marginTop: 48 }}>
            <div className="lhs">
              <div className="eyebrow">{t("familyFavorites")}</div>
              <h2>{t("familyFavoritesSub")}</h2>
            </div>
            <div className="rhs">
              <span className="dim mono" style={{ fontSize: 12 }}>{favs.length} {t("recipes")}</span>
            </div>
          </div>
          <div className="grid">
            {favs.map((r) => <RecipeCard {...cardProps(r)} />)}
          </div>
          </>}

          {rest.length > 0 && <>
          <div className="section-head" style={{ marginTop: 64 }}>
            <div className="lhs">
              <div className="eyebrow">{t("deeperShelves")}</div>
              <h2>{t("everythingElse")}</h2>
            </div>
            <div className="rhs"><span className="dim mono" style={{ fontSize: 12 }}>{rest.length} {t("recipes")}</span></div>
          </div>
          <div className="grid">
            {rest.map((r) => <RecipeCard {...cardProps(r)} />)}
          </div>
          </>}
        </> :

      <>
          <div className="section-head" style={{ marginTop: 32 }}>
            <div className="lhs">
              <div className="eyebrow">{t("searchResults")}</div>
              <h2>{recipes.length} {recipes.length === 1 ? t("recipe") : t("recipes")}</h2>
            </div>
          </div>
          {recipes.length === 0 ? (
            allRecipes.length === 0 ? (
              // Cookbook is genuinely empty (no recipes at all in
              // this cookbook). Different copy from the "search
              // returned nothing" case so the cook knows the
              // cookbook itself is blank rather than thinking
              // their filter is too tight.
              <div className="empty-cookbook">
                <Icon name="book" size={48} />
                <div className="t">No recipes here yet.</div>
                <div className="s">
                  {canWriteActive
                    ? "This cookbook is empty. Add the first recipe to get started."
                    : "This cookbook is empty. Only owners and editors can add recipes — ask whoever invited you."}
                </div>
                {canWriteActive && (
                  <button className="btn primary" onClick={openAddRecipe}>
                    <Icon name="plus" size={14} /> Add a recipe
                  </button>
                )}
              </div>
            ) : (
              <div style={{ padding: 80, textAlign: "center", color: "var(--ink-3)" }}>
                <div style={{ fontSize: 48, marginBottom: 16, fontFamily: "var(--serif)", fontStyle: "italic" }}>{t("noResults")}</div>
                <div>{t("noResultsTryAgain")} <button className="btn ghost sm" onClick={openAddRecipe}>{t("addThisRecipeYourself")}</button>.</div>
              </div>
            )
          ) : (
            <div className="grid">
              {recipes.map((r) => <RecipeCard {...cardProps(r)} />)}
            </div>
          )}
        </>
      }
    </div>);

}

