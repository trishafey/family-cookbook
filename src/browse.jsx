// Browse / home page — the first thing the user sees.

import { useState, useEffect, useMemo } from "react";
import { Icon, Pill, fmtDuration } from "./helpers.jsx";
import { FLAGS } from "./config/flags.js";
import { COURSES, OCCASIONS } from "./data.js";

export function RecipeCard({ recipe, onOpen, selected, selectIdx, onToggleSelect, selectionMode, isFavorite, onToggleFavorite }) {
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
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}>
          <Icon name={isFavorite ? "heartFill" : "heart"} size={13} />
        </button>
        }
        {selectionMode && selected &&
        <div className="select-mark">{selectIdx + 1}</div>
        }
        <div className="meta-overlay">
          <span>{fmtDuration(recipe.total)}</span>
          <span>{recipe.difficulty}</span>
        </div>
      </div>
      <div className="body">
        <div className="author">by {recipe.author}</div>
        <div className="title">{recipe.title}</div>
        <div className="sub">{recipe.subtitle}</div>
        <div className="tags">
          {recipe.diet.slice(0, 2).map((d) => <Pill key={d} kind="olive">{d}</Pill>)}
          <Pill kind="slate">{recipe.cuisine}</Pill>
        </div>
        <div className="footer">
          <span><Icon name="starFill" size={10} /> {recipe.rating} · {recipe.cookCount} cooks</span>
          <span>{recipe.occasion}</span>
        </div>
      </div>
    </div>);

}

export function Browse({ recipes, allRecipes, query, setQuery, filters, setFilters, openRecipe, openFilters, selection, toggleSelect, selectionMode, favorites = [], toggleFavorite, openAddRecipe, openMealBuilder, openLab }) {

  // Active filter chips
  const activeChips = [];
  for (const k of ["courses", "diets", "occasions", "authors", "cuisines", "difficulties"]) {
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
      {/* Editorial masthead */}
      <header style={{ textAlign: "center", padding: "32px 0 48px", borderBottom: "1px solid var(--rule)", borderWidth: "0px" }}>
        <h1 style={{ fontSize: 84, fontWeight: 400, margin: "12px 0 8px", letterSpacing: "-0.02em" }}>
          The <em style={{ color: "var(--accent)" }}>Family</em> Cookbook
        </h1>
        <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn primary" onClick={openAddRecipe}><Icon name="plus" /> Add a recipe</button>
          <button className="btn" onClick={openMealBuilder}><Icon name="bowl" /> Build a meal</button>
          {FLAGS.lab && (
          <button className="btn" onClick={openLab} style={{ borderColor: "rgba(110,122,58,.4)", color: "var(--accent-2)" }}>
            <Icon name="sparkle" /> Kitchen experimentation
          </button>
          )}
        </div>
      </header>

      {/* Active filters */}
      {activeChips.length > 0 &&
      <div className="filterbar">
          <span className="label">Filtering by</span>
          {activeChips.map((c) =>
        <button key={`${c.k}-${c.v}`} className="filter-pill on" onClick={() => removeChip(c.k, c.v)}>
              {c.v} <Icon name="x" size={10} />
            </button>
        )}
          <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setFilters({ courses: [], diets: [], occasions: [], authors: [], cuisines: [], difficulties: [], maxTime: 0 })}>
            Clear all
          </button>
        </div>
      }

      {/* Quick course pills */}
      {showingAll &&
      <div className="filterbar" style={{ marginTop: 56 }}>
          <span className="label">Browse by course</span>
          {COURSES.map((c) =>
        <button key={c} className="filter-pill" onClick={() => setFilters((f) => ({ ...f, courses: [c] }))}>{c}</button>
        )}
          <span className="label" style={{ marginLeft: 16 }}>Occasion</span>
          {OCCASIONS.map((o) =>
        <button key={o} className="filter-pill" onClick={() => setFilters((f) => ({ ...f, occasions: [o] }))}>{o}</button>
        )}
          <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={openFilters}>
            <Icon name="filter" size={13} /> More filters
          </button>
        </div>
      }

      {/* Section: showing-all → favorites then rest. Otherwise: flat. */}
      {showingAll ?
      <>
          {favs.length > 0 && <>
          <div className="section-head" style={{ marginTop: 48 }}>
            <div className="lhs">
              <div className="eyebrow">Family favorites</div>
              <h2>The ones we keep coming back for</h2>
            </div>
            <div className="rhs">
              <span className="dim mono" style={{ fontSize: 12 }}>{favs.length} recipes</span>
            </div>
          </div>
          <div className="grid">
            {favs.map((r) => <RecipeCard {...cardProps(r)} />)}
          </div>
          </>}

          <div className="section-head" style={{ marginTop: 64 }}>
            <div className="lhs">
              <div className="eyebrow">The deeper shelves</div>
              <h2>Everything else</h2>
            </div>
            <div className="rhs"><span className="dim mono" style={{ fontSize: 12 }}>{rest.length} recipes</span></div>
          </div>
          <div className="grid">
            {rest.map((r) => <RecipeCard {...cardProps(r)} />)}
          </div>
        </> :

      <>
          <div className="section-head" style={{ marginTop: 32 }}>
            <div className="lhs">
              <div className="eyebrow">Search results</div>
              <h2>{recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}</h2>
            </div>
          </div>
          {recipes.length === 0 ?
        <div style={{ padding: 80, textAlign: "center", color: "var(--ink-3)" }}>
              <div style={{ fontSize: 48, marginBottom: 16, fontFamily: "var(--serif)", fontStyle: "italic" }}>Nothing matches.</div>
              <div>Try fewer filters, or <button className="btn ghost sm" onClick={openAddRecipe}>add this recipe yourself</button>.</div>
            </div> :

        <div className="grid">
              {recipes.map((r) => <RecipeCard {...cardProps(r)} />)}
            </div>
        }
        </>
      }
    </div>);

}

