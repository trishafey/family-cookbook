// Build a meal — multi-select recipes, then preview the combined plan.

import { useEffect, useMemo, useState } from "react";
import { Icon, fmtDuration, logEvent, normalizeRecipe } from "./helpers.jsx";
import { RecipeCard } from "./browse.jsx";

export function BuildAMeal({ recipes, selection, clearSelection, toggleSelect, openRecipe, onClose, onPlanMeal, authEmail }) {
  useEffect(() => { logEvent("build-a-meal-open"); }, []);

  // Cross-cookbook recipe pool. We fetch every recipe the cook
  // can see across every cookbook they're a member of, then let
  // them filter by cookbook + search. Falls back to whatever
  // `recipes` the parent passed in when the fetch hasn't
  // returned yet (so the page never flashes empty).
  const [crossRecipes, setCrossRecipes] = useState(null);
  useEffect(() => {
    if (!authEmail) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/me/recipes", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setCrossRecipes(data.map(normalizeRecipe));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [authEmail]);

  const pool = crossRecipes || recipes;

  // Unique cookbooks present in the pool — drives the filter
  // pills above the grid.
  const cookbooks = useMemo(() => {
    const seen = new Map();
    for (const r of pool) {
      if (r.cookbookId && !seen.has(r.cookbookId)) {
        seen.set(r.cookbookId, r.cookbookName || "Cookbook");
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [pool]);

  const [filterCookbookId, setFilterCookbookId] = useState("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const visibleRecipes = useMemo(() => pool.filter(r => {
    if (filterCookbookId !== "all" && r.cookbookId !== filterCookbookId) return false;
    if (!q) return true;
    const fields = [r.title, r.subtitle, r.author, r.cuisine, r.course, r.cookbookName]
      .filter(Boolean).join(" ").toLowerCase();
    return fields.includes(q);
  }), [pool, filterCookbookId, q]);

  const selected = selection
    .map(id => pool.find(r => r.id === id) || recipes.find(r => r.id === id))
    .filter(Boolean);
  const totalTime = Math.max(...selected.map(r => r.total), 0);
  const totalCal  = selected.reduce((s, r) => s + (r.nutrition?.cal || 0), 0);

  return (
    <div className="app" data-screen-label="05 Build a Meal">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      <div className="page-header">
        <div className="eyebrow">Multi-select mode</div>
        <h1>Build a <em>meal</em></h1>
        <div className="intro">
          Pick the courses, we'll merge the shopping lists and stagger the cook times.
        </div>
      </div>

      {/* Selected slot */}
      {selected.length > 0 ? (
        <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: "var(--radius-lg)", padding: 24, marginBottom: 32 }}>
          <div className="eyebrow" style={{ color: "var(--accent)" }}>Your menu</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
            {selected.map((r, i) => (
              <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 16px 8px 8px", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 999 }}>
                <span style={{ width: 24, height: 24, borderRadius: 999, background: "var(--accent)", color: "var(--paper)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600, fontFamily: "var(--mono)" }}>{i + 1}</span>
                <span style={{ fontFamily: "var(--serif)", fontSize: 15 }}>{r.title}</span>
                {r.cookbookName && <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".08em" }}>· {r.cookbookName}</span>}
                <button className="btn ghost icon-only" onClick={() => toggleSelect(r)}><Icon name="x" size={14} /></button>
              </div>
            ))}
            <button className="btn ghost sm" onClick={clearSelection}>
              <Icon name="x" size={14} /> Clear
            </button>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--rule)" }}>
            <div style={{ flex: "1 1 240px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <div>
                <div className="eyebrow">Courses</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 26 }}>{selected.length}</div>
              </div>
              <div>
                <div className="eyebrow">Longest cook</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 26 }}>{fmtDuration(totalTime)}</div>
              </div>
              <div>
                <div className="eyebrow">Calories (per pers.)</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 26 }}>{totalCal.toLocaleString()}</div>
              </div>
            </div>
            <button className="btn primary lg" onClick={() => onPlanMeal(selected)} style={{ flexShrink: 0 }}>
              <Icon name="clock" /> Plan & cook together →
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", background: "var(--paper-2)", border: "1px dashed var(--rule)", borderRadius: "var(--radius-lg)", marginBottom: 32 }}>
          <Icon name="bowl" size={28} />
          <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", marginTop: 12 }}>
            Pick recipes below to start building your meal.
          </div>
        </div>
      )}

      <div className="section-head">
        <div className="lhs">
          <div className="eyebrow">Tap to add</div>
          <h3>Recipes</h3>
        </div>
        <div className="rhs"><span className="dim mono" style={{ fontSize: 12 }}>{visibleRecipes.length} {visibleRecipes.length === 1 ? "option" : "options"}</span></div>
      </div>

      {/* Cross-cookbook filter row — cookbook pills + search */}
      <div className="meal-filter-row">
        {cookbooks.length > 1 && (
          <div className="meal-cookbook-pills" role="tablist" aria-label="Filter by cookbook">
            <button
              type="button"
              className={`meal-cookbook-pill ${filterCookbookId === "all" ? "active" : ""}`}
              onClick={() => setFilterCookbookId("all")}
            >
              All cookbooks
            </button>
            {cookbooks.map(cb => (
              <button
                key={cb.id}
                type="button"
                className={`meal-cookbook-pill ${filterCookbookId === cb.id ? "active" : ""}`}
                onClick={() => setFilterCookbookId(cb.id)}
              >
                {cb.name}
              </button>
            ))}
          </div>
        )}
        <div className="meal-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            className="meal-search-input"
            placeholder="Search recipes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="btn ghost icon-only" onClick={() => setQuery("")}>
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="grid">
        {visibleRecipes.map(r => (
          <RecipeCard
            key={r.id}
            recipe={r}
            onOpen={openRecipe}
            selected={selection.includes(r.id)}
            selectIdx={selection.indexOf(r.id)}
            onToggleSelect={toggleSelect}
            selectionMode={true}
          />
        ))}
      </div>
    </div>
  );
}

