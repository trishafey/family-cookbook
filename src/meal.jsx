// Build a meal — multi-select recipes, then preview the combined plan.

import { useEffect } from "react";
import { Icon, fmtDuration, logEvent } from "./helpers.jsx";
import { RecipeCard } from "./browse.jsx";

export function BuildAMeal({ recipes, selection, clearSelection, toggleSelect, openRecipe, onClose, onShop, onPlanMeal }) {
  useEffect(() => { logEvent("build-a-meal-open"); }, []);
  const selected = selection.map(id => recipes.find(r => r.id === id)).filter(Boolean);
  const totalTime = Math.max(...selected.map(r => r.total), 0);
  const totalCal  = selected.reduce((s, r) => s + r.nutrition.cal, 0);

  return (
    <div className="app" data-screen-label="05 Build a Meal">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      <div className="section-head">
        <div className="lhs">
          <div className="eyebrow">Multi-select mode</div>
          <h2>Build a meal</h2>
          <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-3)", marginTop: 6 }}>
            Pick the courses, we'll merge the shopping lists and stagger the cook times.
          </div>
        </div>
        <div className="rhs">
          {selection.length > 0 && (
            <>
              <button className="btn" onClick={clearSelection}>Clear ({selection.length})</button>
              <button className="btn" onClick={() => onShop(selected.map(r => ({ recipe: r, ings: r.ingredients })))}>
                <Icon name="bowl" /> Combined shopping list
              </button>
              <button className="btn primary" onClick={() => onPlanMeal(selected)}>
                <Icon name="clock" /> Plan & cook together
              </button>
            </>
          )}
        </div>
      </div>

      {/* Selected slot */}
      {selected.length > 0 ? (
        <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: "var(--radius-lg)", padding: 24, marginBottom: 32 }}>
          <div className="eyebrow" style={{ color: "var(--accent)" }}>Your menu</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 16 }}>
            {selected.map((r, i) => (
              <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 16px 8px 8px", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 999 }}>
                <span style={{ width: 24, height: 24, borderRadius: 999, background: "var(--accent)", color: "var(--paper)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600, fontFamily: "var(--mono)" }}>{i + 1}</span>
                <span style={{ fontFamily: "var(--serif)", fontSize: 15 }}>{r.title}</span>
                <button className="btn ghost icon-only" onClick={() => toggleSelect(r)}><Icon name="x" size={14} /></button>
              </div>
            ))}
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
          <h3>All recipes</h3>
        </div>
        <div className="rhs"><span className="dim mono" style={{ fontSize: 12 }}>{recipes.length} options</span></div>
      </div>
      <div className="grid">
        {recipes.map(r => (
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

