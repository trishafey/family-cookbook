// Browse / home page — the first thing the user sees.

const { useState, useEffect, useMemo } = React;

function FeaturedStrip({ recipes, onOpen }) {
  if (recipes.length < 3) return null;
  const [big, ...small] = recipes;
  return (
    <div className="featured">
      <div className="big" onClick={() => onOpen(big)} style={{ backgroundImage: `url(${big.photo})` }} data-screen-label={`Featured: ${big.title}`}>
        <div className="info">
          <span className="pill" style={{ background: "rgba(255,255,255,.18)", color: "white", border: "1px solid rgba(255,255,255,.3)" }}>
            <Icon name="starFill" size={11} /> Family favorite
          </span>
          <h2 style={{ marginTop: 12 }}>{big.title}</h2>
          <div className="sub">{big.subtitle}</div>
          <div style={{ marginTop: 16, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".08em", opacity: .9 }}>
            BY {big.author.toUpperCase()} · {fmtDuration(big.total)} · {big.difficulty.toUpperCase()}
          </div>
        </div>
      </div>
      {small.slice(0, 2).map((r) =>
      <div className="card small" key={r.id} onClick={() => onOpen(r)}>
          <div className="photo" style={{ backgroundImage: `url(${r.photoCard || r.photo})` }} />
          <div className="body">
            <div className="author">{r.author}</div>
            <div className="title" style={{ fontSize: 18 }}>{r.title}</div>
            <div className="footer">
              <span>{fmtDuration(r.total)}</span>
              <span>{r.course}</span>
            </div>
          </div>
        </div>
      )}
    </div>);

}

function RecipeCard({ recipe, onOpen, selected, selectIdx, onToggleSelect, selectionMode }) {
  return (
    <div
      className={`card ${selected ? "selected" : ""}`}
      onClick={() => selectionMode ? onToggleSelect(recipe) : onOpen(recipe)}
      data-screen-label={recipe.title}>
      
      <div className="photo" style={{ backgroundImage: `url(${recipe.photoCard || recipe.photo})` }}>
        <div className="ribbon">{recipe.course}</div>
        {!selectionMode && recipe.favorite &&
        <div className="fave"><Icon name="heartFill" size={13} /></div>
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

function Browse({ recipes, allRecipes, query, setQuery, filters, setFilters, openRecipe, openFilters, selection, toggleSelect, selectionMode, openAddRecipe, openMealBuilder, openLab }) {

  // Active filter chips
  const activeChips = [];
  for (const k of ["courses", "diets", "occasions", "authors", "cuisines", "difficulties"]) {
    for (const v of filters[k] || []) activeChips.push({ k, v });
  }
  if (filters.maxTime) activeChips.push({ k: "maxTime", v: `≤ ${fmtDuration(filters.maxTime)}` });

  const removeChip = (k, v) => {
    setFilters((f) => ({ ...f, [k]: k === "maxTime" ? 0 : f[k].filter((x) => x !== v) }));
  };

  // Group recipes: "Family Favorites" first, then by course
  const favs = recipes.filter((r) => r.favorite);
  const rest = recipes.filter((r) => !r.favorite);
  const showingAll = !query && activeChips.length === 0;

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
          <button className="btn" onClick={openLab} style={{ borderColor: "rgba(110,122,58,.4)", color: "var(--accent-2)" }}>
            <Icon name="sparkle" /> Kitchen experimentation
          </button>
        </div>
      </header>

      {/* Featured strip — only when not filtering */}
      {showingAll &&
      <div style={{ marginTop: 48 }}>
          <div className="section-head">
            <div className="lhs">
              <div className="eyebrow">In rotation this week</div>
              <h2>From the inner circle</h2>
            </div>
            <div className="rhs">
              <button className="btn ghost sm" onClick={openFilters}><Icon name="filter" size={14} /> Filters</button>
            </div>
          </div>
          <FeaturedStrip recipes={favs.slice(0, 3)} onOpen={openRecipe} />
        </div>
      }

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
          {window.COURSES.map((c) =>
        <button key={c} className="filter-pill" onClick={() => setFilters((f) => ({ ...f, courses: [c] }))}>{c}</button>
        )}
          <span className="label" style={{ marginLeft: 16 }}>Occasion</span>
          {window.OCCASIONS.map((o) =>
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
          <div className="section-head" style={{ marginTop: 48 }}>
            <div className="lhs">
              <div className="eyebrow">Family favorites</div>
              <h2>The ones we keep coming back to</h2>
            </div>
            <div className="rhs">
              <span className="dim mono" style={{ fontSize: 12 }}>{favs.length} recipes</span>
            </div>
          </div>
          <div className="grid">
            {favs.map((r) =>
          <RecipeCard key={r.id} recipe={r} onOpen={openRecipe}
          selected={selection.includes(r.id)} selectIdx={selection.indexOf(r.id)}
          onToggleSelect={toggleSelect} selectionMode={selectionMode} />
          )}
          </div>

          <div className="section-head" style={{ marginTop: 64 }}>
            <div className="lhs">
              <div className="eyebrow">The deeper shelves</div>
              <h2>Everything else</h2>
            </div>
            <div className="rhs"><span className="dim mono" style={{ fontSize: 12 }}>{rest.length} recipes</span></div>
          </div>
          <div className="grid">
            {rest.map((r) =>
          <RecipeCard key={r.id} recipe={r} onOpen={openRecipe}
          selected={selection.includes(r.id)} selectIdx={selection.indexOf(r.id)}
          onToggleSelect={toggleSelect} selectionMode={selectionMode} />
          )}
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
              {recipes.map((r) =>
          <RecipeCard key={r.id} recipe={r} onOpen={openRecipe}
          selected={selection.includes(r.id)} selectIdx={selection.indexOf(r.id)}
          onToggleSelect={toggleSelect} selectionMode={selectionMode} />
          )}
            </div>
        }
        </>
      }
    </div>);

}

Object.assign(window, { Browse, RecipeCard });