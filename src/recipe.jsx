// Recipe detail — 3 variants share the same state & sub-components.
// Variants: editorial (default), magazine, binder.

import React, { useState, useEffect, useMemo } from "react";
import { Icon, fmtDuration, fmtTime, formatQty, scaleByWeight, scaleIngredients, scheduleForFinish, useStorage } from "./helpers.jsx";
import { convertIngredient } from "./units.js";
import { useLang } from "./i18n.js";
import { TimeOfDayInput, PrintOnly } from "./ui.jsx";
import { NeedHelp } from "./need-help.jsx";
import { PairingsSection } from "./pairings.jsx";
import { FLAGS } from "./config/flags.js";

// ─────────────────────────────────────────────────────────────
// Shared: AI Adjust box
// ─────────────────────────────────────────────────────────────
// Chips are canned, one-tap prompts that apply a deterministic
// local change (setServings, setWeight, etc.) — no AI call needed.
// Free-text prompts go through /api/admin/ai/adjust, which returns
// a written summary plus an optional structured action the client
// applies via applyAction below.

function makeChips(recipe, currentServings, currentWeight) {
  const chips = [];
  if (recipe.scaleBy === "weight") {
    (recipe.weightOptions || [3, 4, 6, 8]).forEach((w) => {
      if (w !== currentWeight) chips.push({
        label: `Adjust to ${w} ${recipe.weightUnit || "lb"}`,
        prompt: `Adjust the cook time and ingredients for a ${w} ${recipe.weightUnit || "lb"} roast.`,
        apply: (s) => s.setWeight(w),
        summary: `Scaled to ${w} ${recipe.weightUnit || "lb"} — cook time now ${Math.round(w * recipe.cookMinsPerLb)} min`,
      });
    });
  } else {
    [2, 4, 8, 12].forEach((n) => {
      if (n !== currentServings) chips.push({
        label: `Make for ${n} servings`,
        prompt: `Adjust this recipe to serve ${n} people.`,
        apply: (s) => s.setServings(n),
        summary: `Scaled to ${n} servings — ingredient amounts adjusted proportionally`,
      });
    });
  }
  if (!recipe.diet.includes("Gluten-free")) {
    chips.push({
      label: "Make it gluten-free",
      prompt: "Suggest gluten-free substitutions for this recipe.",
      apply: () => {},
      summary: "Suggested swaps: gluten-free pasta or flour blend (1:1). All sauces and seasoning are GF-friendly. Verify any store-bought sausage or stock.",
    });
  }
  if (!recipe.diet.includes("Dairy-free")) {
    chips.push({
      label: "Make dairy-free",
      prompt: "Suggest dairy-free substitutions for this recipe.",
      apply: () => {},
      summary: "Use Miyoko's or Kite Hill for cheeses; replace butter with olive oil or vegan butter. Texture shifts slightly nutty.",
    });
  }
  chips.push({
    label: "Lower calories by 30%",
    prompt: "Reduce the calories per serving by about 30% without changing the soul of the dish.",
    apply: (s) => s.setCalTarget(Math.round(recipe.nutrition.cal * 0.7)),
    summary: "Trimmed fats and adjusted portions — target ≈ " + Math.round(recipe.nutrition.cal * 0.7) + " cal/serving",
  });
  chips.push({
    label: "Quicker weeknight version",
    prompt: "Suggest shortcuts to make this in under 30 minutes.",
    apply: () => {},
    summary: "Skip the overnight salt; use jarred sauce as a base; pre-shredded cheese. ~22 min total.",
  });

  // Per-recipe extras
  const perRecipe = {
    "ewas-pierogies": [
      { label: "Meat filling variation",            prompt: "How do I make a ground meat filling for these pierogies?",          apply: () => {}, summary: "Brown ground pork/beef with sautéed onion, garlic, and a pinch of marjoram. Cool fully before filling. See the 'Meat filling' card under Goes great with." },
      { label: "Sauerkraut & mushroom filling",     prompt: "How do I make a sauerkraut and mushroom filling?",                  apply: () => {}, summary: "Sauté onion + chopped mushrooms in butter, add drained sauerkraut, cook until almost dry. The Wigilia classic. See the 'Sauerkraut & mushroom filling' suggestion." },
      { label: "Blueberry (sweet) pierogies",       prompt: "Can I make blueberry pierogies with this dough?",                   apply: () => {}, summary: "Yes — toss blueberries with sugar + a little cornstarch right before filling. Use slightly less filling and seal extra well. Serve with butter, sour cream, sugar." },
    ],
    "trish-covid-bread": [
      { label: "Olive + rosemary loaf",             prompt: "How do I add olives and rosemary to this bread?",                   apply: () => {}, summary: "Stir in ½ cup chopped olives and 1 tbsp chopped fresh rosemary when mixing the dough. Same rise, same bake." },
      { label: "Date, walnut & cinnamon",           prompt: "How do I make a sweet date-walnut-cinnamon variation?",             apply: () => {}, summary: "Fold ½ cup chopped dates, ⅓ cup walnuts, and 1 tsp cinnamon into the dough. Lovely with butter and coffee." },
      { label: "Surprise me with a pantry twist",   prompt: "Look at what's likely in my pantry and suggest a flavor twist.",    apply: () => {}, summary: "Try sesame + nigella seed crust; or pre-soaked dried apricots + cardamom; or grated cheddar + black pepper baked in." },
    ],
    "kt-turkey": [
      { label: "Make the stuffing meatless",        prompt: "How do I make the stuffing meatless?",                              apply: () => {}, summary: "Replace the meat with ~1.5 cups sautéed mushrooms + 1 cup chopped celery + extra onion. Bind with the eggs as written; everything else stays." },
    ],
    "block-party-ribs": [
      { label: "Turn rib broth into tomato soup",   prompt: "How do I use the leftover rib broth for Ryszard's tomato soup?",     apply: () => {}, summary: "Strain the rib broth, dissolve 1–2 bouillon cubes in it, and use it in place of the water in Ryszard's Creamy Tomato Soup. Add the crushed tomatoes and finish as written." },
    ],
  };
  (perRecipe[recipe.id] || []).forEach(c => chips.push(c));

  return chips;
}

function AIAdjustBox({ recipe, scaler, applied, setApplied, authEmail }) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const chips = makeChips(recipe, scaler.servings, scaler.weight);

  // Chips still apply their own concrete change locally — they're
  // canned, predictable, and don't need the AI. Only free-text
  // prompts go through the model.
  const triggerChip = (chip) => {
    setText(chip.prompt);
    setRunning(true);
    setTimeout(() => {
      chip.apply(scaler);
      setApplied([{ summary: chip.summary, prompt: chip.prompt }, ...applied]);
      setRunning(false);
      setText("");
    }, 600);
  };

  // Apply a structured action returned by the worker. Each branch
  // matches one of the AI_ADJUST_SCHEMA action kinds.
  const applyAction = (action) => {
    if (!action || action.kind === "none" || action.value == null) return;
    if (action.kind === "setServings") scaler.setServings(Math.max(1, Math.round(action.value)));
    else if (action.kind === "setWeight") scaler.setWeight(action.value);
    else if (action.kind === "setCalTarget") scaler.setCalTarget?.(Math.max(0, Math.round(action.value)));
  };

  const triggerFree = async () => {
    if (!text.trim()) return;
    if (!authEmail) {
      setError("Sign in to use Adjust with AI.");
      return;
    }
    const prompt = text;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/adjust", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          recipe,
          prompt,
          servings: scaler.servings,
          weight: scaler.weight,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Adjust failed (${res.status})`);
      }
      const { summary, action } = await res.json();
      applyAction(action);
      setApplied([{ summary, prompt }, ...applied]);
      setText("");
    } catch (err) {
      setError(err.message || "Could not reach the kitchen AI.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <details className="ai-adjust">
      <summary className="header">
        <span className="header-text">
          <Icon name="sparkle" size={11} /> Adjust with AI
        </span>
        <span className="chev">›</span>
      </summary>
      <div className="input-wrap">
        <div className="chips">
          {chips.slice(0, 6).map((c, i) => (
            <button key={i} className="chip" onClick={() => triggerChip(c)} disabled={running}>
              <Icon name="sparkle" size={9} /> {c.label}
            </button>
          ))}
        </div>
        <textarea
          placeholder={`Or type your own — e.g. "${recipe.scaleBy === "weight" ? "Adjust the cook time for a 4 lb roast" : "Make this for 2 servings instead of 4"}"`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) triggerFree(); }}
          disabled={!authEmail}
        />
        <div className="actions">
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {running ? "Adjusting…" : (authEmail ? "⌘⏎ to apply" : "Sign in to use the AI")}
          </span>
          <button className="btn primary sm" onClick={triggerFree} disabled={!text.trim() || running || !authEmail}>
            <Icon name="sparkle" size={11} /> Apply
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#933" }}>{error}</div>
        )}
      </div>
      {applied.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {applied.map((a, i) => (
            <div className="applied" key={i}>
              <Icon name="check" size={14} style={{ color: "var(--accent-2)", flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>{a.summary}</div>
              <button className="x" onClick={() => setApplied(applied.filter((_, j) => j !== i))} aria-label="Dismiss">
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Source link (when a recipe is adapted from somewhere)
// ─────────────────────────────────────────────────────────────
function SourceLink({ recipe }) {
  if (!recipe.link?.url) return null;
  return (
    <div style={{ marginTop: 8, fontSize: 13, fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-3)" }}>
      <Icon name="link" size={11} />{" "}
      Adapted from{" "}
      <a href={recipe.link.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>
        {recipe.link.label || recipe.link.url}
      </a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Tag row (filter-style tags inline on the recipe page)
// ─────────────────────────────────────────────────────────────
// Map an origin key ("heirloom" | "newToFamily" | "lab") to its
// icon. The same icon shows on recipe cards and the recipe detail
// page so the badge is recognisable everywhere.
const ORIGIN_ICONS = { heirloom: "tomato", newToFamily: "sprout", lab: "beaker" };

function OriginBadge({ origin, size = 11 }) {
  const { tOrigin } = useLang();
  if (!origin || !ORIGIN_ICONS[origin]) return null;
  return (
    <span className="recipe-tag origin" title={tOrigin(origin)} data-origin={origin}>
      <Icon name={ORIGIN_ICONS[origin]} size={size} /> {tOrigin(origin)}
    </span>
  );
}

function TagRow({ recipe, scaled }) {
  const { t, tCourse, tOccasion, tDiet, tDifficulty } = useLang();
  return (
    <div className="tag-row">
      <SourcePhotosReveal recipe={recipe} />
      <OriginBadge origin={recipe.origin} />
      <span className="recipe-tag diff">
        <span className="dot" /> {tDifficulty(recipe.difficulty)}
      </span>
      <span className="recipe-tag time">
        <Icon name="clock" size={11} /> {fmtDuration(scaled.totalTime)}
      </span>
      <span className="recipe-tag">
        <span className="dot" style={{ background: "var(--accent-cool)" }} /> {tCourse(recipe.course)}
      </span>
      <span className="recipe-tag">
        <span className="dot" style={{ background: "var(--ink-3)" }} /> {recipe.cuisine}
      </span>
      <span className="recipe-tag">
        <span className="dot" style={{ background: "var(--accent-warm)" }} /> {tOccasion(recipe.occasion)}
      </span>
      {recipe.diet.slice(0, 3).map(d => (
        <span key={d} className="recipe-tag diet"><span className="dot" /> {tDiet(d)}</span>
      ))}
      <span className="recipe-tag author">{t("by")} {recipe.author}</span>
    </div>
  );
}

// Helper: map a weight-based recipe's current weight to a sensible servings number
function servingsForRecipe(recipe, scaler) {
  if (recipe.scaleBy === "weight") {
    const lbPerServing = recipe.lbPerServing || 0.7;
    return Math.max(1, Math.round(scaler.weight / lbPerServing));
  }
  return scaler.servings;
}

// ─────────────────────────────────────────────────────────────
// Shared: Stats strip (prep / cook / total / servings)
// ─────────────────────────────────────────────────────────────
function StatsStrip({ recipe, scaler, scaled, finalNutrition, showNutrition, setShowNutrition }) {
  const { t } = useLang();
  const isWeight = recipe.scaleBy === "weight";
  const currentServings = servingsForRecipe(recipe, scaler);

  const bumpServings = (delta) => {
    const next = Math.max(1, currentServings + delta);
    if (isWeight) {
      const lbPerServing = recipe.lbPerServing || 0.7;
      scaler.setWeight(+(next * lbPerServing).toFixed(1));
    } else {
      scaler.setServings(next);
    }
  };

  return (
    <div className="stats-strip">
      <div className="row">
        <div className="cell">
          <div className="label">{t("prep")}</div>
          <div className="val">{recipe.prep}<span className="unit"> min</span></div>
        </div>
        <div className="cell">
          <div className="label">{t("cook")}</div>
          <div className="val">{scaled.cookMins}<span className="unit"> min</span></div>
        </div>
        <div className="cell">
          <div className="label">{t("total")}</div>
          <div className="val">{fmtDuration(scaled.totalTime)}</div>
        </div>
        <div className="cell servings-cell">
          <div className="label">{t("servings")}</div>
          <div className="servings-control">
            <button onClick={() => bumpServings(-1)} aria-label="Fewer servings" disabled={currentServings <= 1}>
              <Icon name="minus" size={11} />
            </button>
            <span className="val servings-val">
              {currentServings}
            </span>
            <button onClick={() => bumpServings(1)} aria-label="More servings">
              <Icon name="plus" size={11} />
            </button>
          </div>
        </div>
      </div>
      {showNutrition && (
        <>
        <div className="row nutrition">
          <div className="cell"><div className="val">{finalNutrition.cal}</div><div className="label">Calories</div></div>
          <div className="cell"><div className="val">{finalNutrition.protein}g</div><div className="label">Protein</div></div>
          <div className="cell"><div className="val">{finalNutrition.carbs}g</div><div className="label">Carbs</div></div>
          <div className="cell"><div className="val">{finalNutrition.fat}g</div><div className="label">Fat</div></div>
          <div className="cell"><div className="val">{finalNutrition.fiber}g</div><div className="label">Fiber</div></div>
          <div className="cell"><div className="val">{finalNutrition.sodium}mg</div><div className="label">Sodium</div></div>
        </div>
        <div className="nutrition-disclaimer">
          {t("nutritionRough")}
        </div>
        </>
      )}
      <div style={{ padding: "8px 14px", borderTop: "1px solid var(--rule)", textAlign: "center", background: "var(--paper-2)" }}>
        <button className="btn ghost sm" onClick={() => setShowNutrition(!showNutrition)} style={{ fontSize: 11 }}>
          <Icon name={showNutrition ? "chevD" : "chevR"} size={11} />
          {showNutrition ? t("hideNutrition") : t("showNutrition")}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Ingredients card (with grouping)
// ─────────────────────────────────────────────────────────────
function IngredientsCard({ recipe, finalIngs, scaler, onShop, children }) {
  const { t } = useLang();
  const [units, setUnits] = useStorage("units:system", "imperial");
  const displayed = useMemo(
    () => finalIngs.map(i => convertIngredient(i, units)),
    [finalIngs, units]
  );

  const grouped = useMemo(() => {
    const g = {};
    for (const i of displayed) {
      const k = i.grp || "Ingredients";
      // Hide the "Serve" group — those become Pairing suggestions instead
      if (k === "Serve") continue;
      (g[k] = g[k] || []).push(i);
    }
    return g;
  }, [displayed]);

  return (
    <div className="ingredients-card">
      <h3>
        {t("ingredients")}
        <span className="unit-toggle" role="group" aria-label={t("units")}>
          <button type="button" className={units === "imperial" ? "on" : ""} onClick={() => setUnits("imperial")}>US</button>
          <button type="button" className={units === "metric" ? "on" : ""} onClick={() => setUnits("metric")}>Metric</button>
        </span>
      </h3>
      <div className="helper">{displayed.length} {t("itemsGrouped")}</div>

      {Object.entries(grouped).map(([g, items]) => (
        <div key={g}>
          <div className="group-label">{g}</div>
          <ul>
            {items.map((i, idx) => {
              // The "main" weight-scaled ingredient (the roast / turkey / etc.)
              // is the one whose unit matches the recipe's weightUnit on a
              // weight-scaled recipe. Tag the ± control there so adjusting it
              // updates the whole recipe.
              const isWeightAnchor = recipe.scaleBy === "weight"
                && i.scalesWithWeight && i.unit === (recipe.weightUnit || "lb");
              return (
                <li key={idx}>
                  <span className="qty">
                    {isWeightAnchor && (
                      <button
                        type="button"
                        className="qty-bump"
                        onClick={(e) => { e.preventDefault(); scaler.setWeight(Math.max(0.5, +(scaler.weight - 0.5).toFixed(1))); }}
                        aria-label={`Decrease ${recipe.weightUnit || "lb"}`}
                      ><Icon name="minus" size={9} /></button>
                    )}
                    {formatQty(i.qty)} {i.unit}
                    {isWeightAnchor && (
                      <button
                        type="button"
                        className="qty-bump"
                        onClick={(e) => { e.preventDefault(); scaler.setWeight(+(scaler.weight + 0.5).toFixed(1)); }}
                        aria-label={`Increase ${recipe.weightUnit || "lb"}`}
                      ><Icon name="plus" size={9} /></button>
                    )}
                  </span>
                  <span className="item">{i.item}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <button className="btn" style={{ width: "100%", marginTop: 20 }} onClick={onShop}>
        <Icon name="bowl" /> {t("addToShoppingList")}
      </button>

      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Timing bar (done-by)
// ─────────────────────────────────────────────────────────────
// Friendly day label like "Friday" / "Saturday" relative to the finish day.
// dayOffset === 0 → "today" / day-of-finish; -1 → previous day; etc.
function dayLabelFor(finish, dayOffset, locale = "en-US") {
  const d = new Date(finish);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString(locale, { weekday: "long" });
}

function TimingBar({ doneBy, setDoneBy, finishTime, setFinishTime, schedule }) {
  const { t, locale } = useLang();
  const startOffset = schedule?.schedule?.[0]?.dayOffset ?? 0;
  return (
    <div className={`timing-bar ${doneBy ? "active" : ""}`}>
      <Icon name="clock" />
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
        <input type="checkbox" checked={doneBy} onChange={(e) => setDoneBy(e.target.checked)} />
        <span>{t("iWantThisDoneBy")}</span>
      </label>
      <TimeOfDayInput value={finishTime} onChange={setFinishTime} />
      {doneBy && schedule && (
        <span className="start-pill">
          {t("startAt")} {startOffset < 0 ? `${dayLabelFor(finishTime, startOffset, locale)} ` : ""}
          {fmtTime(schedule.startTime)}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Steps list
// ─────────────────────────────────────────────────────────────
function StepsList({ steps, doneBy, schedule, finishTime, bumpStepStart }) {
  const { t, tPrecision, locale } = useLang();
  let lastSection = null;
  let lastDayOffset = null;
  return (
    <div className="steps-list">
      {steps.map((s, i) => {
        const showSection = s.section && s.section !== lastSection;
        if (s.section) lastSection = s.section;
        const stepSched = schedule?.schedule?.[i];
        const off = stepSched?.dayOffset ?? 0;
        const showDay = doneBy && schedule && off !== lastDayOffset;
        if (doneBy && schedule) lastDayOffset = off;
        return (
          <React.Fragment key={i}>
            {showDay && (
              <div className="steps-day">
                {dayLabelFor(finishTime, off, locale)}{off === 0 ? ` — ${t("dayOf")}` : off === -1 ? ` — ${t("dayBefore")}` : ""}
              </div>
            )}
            {showSection && <h4 className="steps-section">{s.section}</h4>}
            <div className={`step ${stepSched?.overnight ? "overnight" : ""}`}>
              <div className="n">{String(i + 1).padStart(2, "0")}</div>
              <div>
                <div className="t">{s.t}</div>
                <div className="d">{s.d}</div>
                <div className="meta">
                  <span className={`precision-${s.precision}`}>● {tPrecision(s.precision)}</span>
                  <span className="time">{fmtDuration(s.mins)}</span>
                  {s.hands != null && <span>{t("handsOn")} {fmtDuration(s.hands)}</span>}
                  {doneBy && schedule && (
                    <span className="start">
                      ▶ {fmtTime(stepSched.start)} – {fmtTime(stepSched.end)}
                      {bumpStepStart && (
                        <span className="start-bump">
                          <button
                            type="button"
                            onClick={() => bumpStepStart(i, -5)}
                            aria-label={t("startMinEarlier")}
                            title={t("startMinEarlier")}
                          ><Icon name="minus" size={9} /></button>
                          <button
                            type="button"
                            onClick={() => bumpStepStart(i, +5)}
                            aria-label={t("startMinLater")}
                            title={t("startMinLater")}
                          ><Icon name="plus" size={9} /></button>
                        </span>
                      )}
                    </span>
                  )}
                  {stepSched?.overnight && <span className="overnight-tag">{t("parkOvernight")}</span>}
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Cook's notes + AI family-says synthesis
// ─────────────────────────────────────────────────────────────
// Family says lives at the top of the cook's-notes disclosure.
// On first view it's empty; a signed-in cook can hit Generate to
// have the model read the family's tips + curated + live comments
// and produce both a short prose summary and 0-4 concrete tweaks
// the family consistently makes. Pinned via recipe.familySays on
// the blob so subsequent visitors get it without re-paying.
function FamilySaysBlock({ recipe, scaler, applied, setApplied, onSaveRecipe, authEmail }) {
  const cached = recipe.familySays;
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const generate = async (force = false) => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/family-says", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ recipeId: recipe.id, force }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Family says failed (${res.status})`);
      }
      const data = await res.json();
      // Worker already persisted to the blob — mirror it onto the
      // in-memory recipe so the section re-renders without a
      // page refresh.
      onSaveRecipe?.({
        ...recipe,
        familySays: {
          summary: data.summary,
          tweaks: data.tweaks,
          generatedAt: data.generatedAt,
        },
      });
    } catch (err) {
      setError(err.message || "Could not synthesise the family notes.");
    } finally {
      setGenerating(false);
    }
  };

  // Apply one of the tweak actions returned by the model. Mirrors
  // the AIAdjustBox.applyAction shape so the same scaler hooks
  // do the work, and the cook gets the same 'applied' card
  // surface to dismiss or revert.
  const applyTweak = (tweak) => {
    const action = tweak.action || { kind: "none" };
    if (action.kind === "setServings" && action.value != null) scaler.setServings(Math.max(1, Math.round(action.value)));
    else if (action.kind === "setWeight" && action.value != null) scaler.setWeight(action.value);
    else if (action.kind === "setCalTarget" && action.value != null) scaler.setCalTarget?.(Math.max(0, Math.round(action.value)));
    setApplied([{ summary: tweak.summary, prompt: `Family tweak: ${tweak.label}` }, ...applied]);
  };

  // No cached synthesis yet — show a Generate CTA to signed-in
  // cooks; render nothing for guests so the section stays clean.
  if (!cached) {
    if (!authEmail) return null;
    return (
      <div className="family-says empty">
        <div className="icon"><Icon name="sparkle" size={14} /></div>
        <div className="body">
          <div className="label">AI summary · what the family does differently</div>
          <button className="btn ghost sm" onClick={() => generate(false)} disabled={generating}>
            <Icon name="sparkle" size={11} /> {generating ? "Reading the notes…" : "Summarise with AI"}
          </button>
          {error && <div style={{ marginTop: 6, fontSize: 12, color: "#933" }}>{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="family-says">
      <div className="icon"><Icon name="sparkle" size={14} /></div>
      <div className="body">
        <div className="label-row">
          <span className="label">AI summary · what the family does differently</span>
          {authEmail && (
            <button
              className="btn ghost sm regen"
              onClick={() => generate(true)}
              disabled={generating}
              title="Regenerate from the latest comments"
            >
              <Icon name="sparkle" size={10} /> {generating ? "Regenerating…" : "Regenerate"}
            </button>
          )}
        </div>
        <div className="text">{cached.summary}</div>
        {cached.tweaks?.length > 0 && (
          <div className="tweaks">
            {cached.tweaks.map((tw, i) => (
              <button key={i} className="tweak-chip" onClick={() => applyTweak(tw)} title={tw.summary}>
                <Icon name="sparkle" size={9} /> {tw.label}
              </button>
            ))}
          </div>
        )}
        {error && <div style={{ marginTop: 6, fontSize: 12, color: "#933" }}>{error}</div>}
      </div>
    </div>
  );
}

function CooksNotes({ recipe, defaultOpen, scaler, applied, setApplied, onSaveRecipe, authEmail }) {
  const { t } = useLang();
  const familySaysOn = FLAGS.familySays;
  return (
    <details className="disclosure first" open={defaultOpen}>
      <summary>
        <span className="chev">›</span>
        <h3>{t("cooksNotes")}</h3>
        <span className="count">
          {recipe.tips.length} {recipe.tips.length === 1 ? t("oneNote") : t("manyNotes")}
          {familySaysOn && recipe.familySays && " + AI summary"}
        </span>
      </summary>
      <div className="disclosure-body">
        {familySaysOn && (
          <FamilySaysBlock
            recipe={recipe}
            scaler={scaler}
            applied={applied}
            setApplied={setApplied}
            onSaveRecipe={onSaveRecipe}
            authEmail={authEmail}
          />
        )}
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {recipe.tips.map((tip, i) => (
            <li key={i} style={{ fontFamily: "var(--serif)", fontSize: 16, lineHeight: 1.5, padding: "6px 0", color: "var(--ink-2)" }}>{tip}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Comments (disclosure)
// ─────────────────────────────────────────────────────────────
function Lightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <Icon name="x" size={20} />
      </button>
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function StarRow({ value, onChange, readOnly, size = 18 }) {
  return (
    <span className="stars" style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => !readOnly && onChange(value === n ? 0 : n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={readOnly}
          style={{
            background: "none", border: "none", padding: 0,
            cursor: readOnly ? "default" : "pointer",
            fontSize: size, lineHeight: 1,
            color: n <= value ? "#C42807" : "var(--ink-4)",
          }}
        >{n <= value ? "★" : "☆"}</button>
      ))}
    </span>
  );
}

function CommentsPanel({ recipe, addComment, deleteComment, authEmail, defaultOpen }) {
  const { t } = useLang();
  // recipe.comments holds the original cookbook's curated placeholder
  // notes (left over from the seed data). The shared family notes live
  // in recipe.liveComments, which is the only thing we want to show now.
  const all = recipe.liveComments || [];
  const photos = all.filter(c => c.photo).map(c => ({ id: c.id, url: c.photo, name: c.name }));

  const [cName, setCName] = useState("");
  const [cText, setCText] = useState("");
  const [cRating, setCRating] = useState(0);
  const [cPhoto, setCPhoto] = useState(null);
  const [posting, setPosting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const uploadCommentPhoto = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/uploads", { method: "POST", credentials: "include", body });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setCPhoto(url);
    } catch (err) {
      alert(err.message || "Photo upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!cName.trim() || !cText.trim()) return;
    setPosting(true);
    try {
      await addComment(recipe.id, {
        name: cName.trim(),
        text: cText.trim(),
        rating: cRating > 0 ? cRating : null,
        photo: cPhoto,
      });
      setCName(""); setCText(""); setCRating(0); setCPhoto(null);
    } catch (err) {
      alert(err.message || "Could not post note");
    } finally {
      setPosting(false);
    }
  };

  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>
        <span className="chev">›</span>
        <h3>{t("notesInMargin")}</h3>
        <span className="count">{all.length} {all.length === 1 ? t("oneNote") : t("manyNotes")}</span>
      </summary>
      <div className="disclosure-body">
        {photos.length > 0 && (
          <div className="comment-gallery">
            {photos.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLightboxSrc(p.url)}
                title={`From ${p.name}`}
                style={{ background: "none", border: "none", padding: 0, cursor: "zoom-in" }}
              >
                <img src={p.url} alt={`Photo from ${p.name}`} />
              </button>
            ))}
          </div>
        )}
        {all.map((c, i) => {
          const mine = c.created_by && authEmail && c.created_by === authEmail;
          return (
            <div className="comment" key={c.id || i}>
              <div className="av">{(c.name?.[0] || "?").toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div className="head">
                  <span className="name">{c.name}</span>
                  <span className="date">{c.date}</span>
                  {c.rating > 0 && <StarRow value={c.rating} readOnly size={13} />}
                  {mine && deleteComment && (
                    <button
                      type="button"
                      className="btn ghost icon-only"
                      onClick={async () => {
                        if (!confirm("Delete this note?")) return;
                        try { await deleteComment(c.id); } catch (err) { alert(err.message); }
                      }}
                      title={t("deleteYourNote")}
                      style={{ marginLeft: 8, color: "#C42807" }}
                    ><Icon name="x" size={12} /></button>
                  )}
                </div>
                <div className="text">{c.text}</div>
                {c.photo && (
                  <button
                    type="button"
                    onClick={() => setLightboxSrc(c.photo)}
                    className="comment-photo"
                    style={{ background: "none", border: "none", padding: 0, cursor: "zoom-in" }}
                  >
                    <img src={c.photo} alt="Note photo" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {authEmail ? (
          <form className="comment-form" onSubmit={submit} style={{ marginTop: 16 }}>
            <h4 style={{ marginBottom: 8 }}>{t("leaveANote")}</h4>
            <input type="text" placeholder={t("yourName")} value={cName} onChange={(e) => setCName(e.target.value)} required disabled={posting} />
            <textarea placeholder={t("commentPlaceholder")} value={cText} onChange={(e) => setCText(e.target.value)} required disabled={posting} />
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("ratingOptional")}</label>
              <StarRow value={cRating} onChange={setCRating} />
              <label className="btn ghost sm" style={{ cursor: uploadingPhoto ? "wait" : "pointer", marginLeft: "auto" }}>
                <Icon name="camera" size={12} /> {uploadingPhoto ? t("uploading") : cPhoto ? t("photoAttached") : t("addPhoto")}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploadingPhoto || posting} onChange={(e) => uploadCommentPhoto(e.target.files?.[0])} />
              </label>
              {cPhoto && (
                <button type="button" className="btn ghost icon-only" onClick={() => setCPhoto(null)} title={t("removePhoto")}><Icon name="x" size={12} /></button>
              )}
            </div>
            {cPhoto && <img src={cPhoto} alt="" style={{ maxWidth: 180, borderRadius: 4, border: "1px solid var(--rule)" }} />}
            <button className="btn primary" style={{ alignSelf: "flex-end" }} disabled={posting || uploadingPhoto}>
              {posting ? t("posting") : t("postNote")}
            </button>
          </form>
        ) : (
          <div style={{ marginTop: 16, padding: 12, color: "var(--ink-3)", fontStyle: "italic", textAlign: "center" }}>
            {t("signInToLeaveNote")}
          </div>
        )}
      </div>
      {lightboxSrc && <Lightbox src={lightboxSrc} alt="Comment photo" onClose={() => setLightboxSrc(null)} />}
    </details>
  );
}

// ─────────────────────────────────────────────────────────────
// Variant: EDITORIAL (default) — refined, more whitespace, white cards
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Source-photo reveal: when a recipe has originals attached (e.g.
// snapshots of grandma's handwritten card) AND the cook flipped
// "Show on the recipe page" on, we render a chip in the tag row
// labeled "View original". Tapping opens a Polaroid-style overlay
// so the family can see the original handwriting alongside the
// parsed recipe.
// ─────────────────────────────────────────────────────────────
function SourcePhotosReveal({ recipe }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  if (!recipe.showSourcePhotos || !recipe.sourcePhotos?.length) return null;

  return (
    <>
      <button
        type="button"
        className="recipe-tag"
        onClick={() => setOpen(true)}
        aria-label={t("viewOriginalRecipe")}
        style={{
          cursor: "pointer",
          background: "var(--accent)",
          color: "var(--paper)",
          border: "1px solid var(--accent)",
          fontFamily: "var(--serif)", fontStyle: "italic",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        <Icon name="camera" size={11} /> {t("viewOriginal")}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.78)",
            display: "flex", flexDirection: "column",
            padding: 24, overflow: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff", marginBottom: 24 }}>
            <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 18 }}>
              {t("originalRecipeImages")} — {recipe.title}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              style={{
                background: "transparent", color: "#fff",
                border: "1px solid rgba(255,255,255,0.4)", borderRadius: 999,
                padding: "6px 14px", cursor: "pointer", fontFamily: "var(--serif)", fontSize: 14,
              }}
            >
              {t("close")} ×
            </button>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "flex", flexWrap: "wrap", gap: 32,
              justifyContent: "center", alignItems: "flex-start",
              maxWidth: 1100, margin: "0 auto", width: "100%",
            }}
          >
            {recipe.sourcePhotos.map((url, i) => {
              const tilts = [-2.5, 1.8, -1.2, 2.6, -1.9, 1.4];
              const rot = tilts[i % tilts.length];
              return (
                <figure
                  key={url}
                  style={{
                    background: "#fdfaf3",
                    padding: "14px 14px 44px",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.3)",
                    transform: `rotate(${rot}deg)`,
                    margin: 0,
                    maxWidth: 320,
                  }}
                >
                  <img
                    src={url}
                    alt={t("pageN").replace("{n}", i + 1)}
                    style={{ display: "block", width: "100%", height: "auto", maxHeight: 380, objectFit: "cover" }}
                  />
                  <figcaption style={{
                    marginTop: 12, textAlign: "center",
                    fontFamily: "var(--serif)", fontStyle: "italic",
                    color: "#5a4a32", fontSize: 14,
                  }}>
                    {t("pageN").replace("{n}", i + 1)}
                  </figcaption>
                </figure>
              );
            })}
          </div>

          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", marginTop: 24, fontSize: 12, fontFamily: "var(--serif)", fontStyle: "italic" }}>
            {t("tapToClose")}
          </div>
        </div>
      )}
    </>
  );
}

function RecipeEditorial({ recipe, scaler, scaled, finalIngs, finalNutrition,
                          applied, setApplied, showNutrition, setShowNutrition,
                          doneBy, setDoneBy, finishTime, setFinishTime, schedule, bumpStepStart,
                          onCookMode, onShop, comments, addComment, deleteComment,
                          allRecipes, onSaveRecipe, openRecipe, onSaveToLab,
                          authEmail, onEditRecipe, onDeleteRecipe, onBuildMealWith }) {
  const { t, tCourse, tOccasion, tDifficulty } = useLang();
  return (
    <>
      {/* HERO */}
      <div className="recipe-hero">
        <div className="photo" style={{ backgroundImage: `url(${recipe.photo})` }} />
        <div className="meta">
          <div className="eyebrow" style={{ color: "var(--accent)" }}>
            {tCourse(recipe.course)} · {recipe.cuisine}
          </div>
          <h1>{recipe.title}</h1>
          <div className="sub">{recipe.subtitle}</div>
          <SourceLink recipe={recipe} />

          <TagRow recipe={recipe} scaled={scaled} />

          <StatsStrip
        recipe={recipe} scaler={scaler} scaled={scaled}
            finalNutrition={finalNutrition}
            showNutrition={showNutrition} setShowNutrition={setShowNutrition}
          />

          <div className="recipe-actions">
            <button className="btn primary" onClick={() => onCookMode(recipe, scaled.steps, finalIngs)}>
              <Icon name="play" /> {t("startCooking")}
            </button>
            <button className="btn" onClick={() => onShop([{ recipe, ings: finalIngs }])}>
              <Icon name="bowl" /> {t("shoppingList")}
            </button>
            <button className="btn ghost" onClick={() => window.print()}>
              <Icon name="print" /> {t("print")}
            </button>
            <button className="btn ghost" onClick={() => alert("PDF export — coming soon.")}>
              <Icon name="download" /> {t("pdf")}
            </button>
            {authEmail && (
              <button className="btn ghost" onClick={() => onEditRecipe(recipe)}>
                <Icon name="edit" /> {t("edit")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION BREAK — Method */}
      <div className="section-break">
        <span className="label">The method</span>
      </div>

      <div className="recipe-body">
        <aside className="ingredients-panel">
          <IngredientsCard recipe={recipe} finalIngs={finalIngs} scaler={scaler} onShop={() => onShop([{ recipe, ings: finalIngs }])}>
            {FLAGS.adjust && <AIAdjustBox recipe={recipe} scaler={scaler} applied={applied} setApplied={setApplied} authEmail={authEmail} />}
          </IngredientsCard>
        </aside>

        <div>
          <TimingBar doneBy={doneBy} setDoneBy={setDoneBy} finishTime={finishTime} setFinishTime={setFinishTime} schedule={schedule} />
          <StepsList steps={scaled.steps} doneBy={doneBy} schedule={schedule} finishTime={finishTime} bumpStepStart={bumpStepStart} />
          {FLAGS.needHelp && <NeedHelp recipe={recipe} authEmail={authEmail} servings={scaler.servings} weight={scaler.weight} appliedAdjustments={applied} />}
        </div>
      </div>

      <PairingsSection recipe={recipe} allRecipes={allRecipes} openRecipe={openRecipe} onSaveRecipe={onSaveRecipe} onSaveToLab={onSaveToLab} onBuildMealWith={onBuildMealWith} authEmail={authEmail} />
      <div className="section-break">
        <span className="label">From the family</span>
      </div>
      <div>
        <CooksNotes recipe={recipe} defaultOpen={true} scaler={scaler} applied={applied} setApplied={setApplied} onSaveRecipe={onSaveRecipe} authEmail={authEmail} />
        <CommentsPanel recipe={recipe} addComment={addComment} deleteComment={deleteComment} authEmail={authEmail} defaultOpen={false} />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Variant: MAGAZINE — full-bleed hero, two-col below
// ─────────────────────────────────────────────────────────────
function RecipeMagazine({ recipe, scaler, scaled, finalIngs, finalNutrition,
                         applied, setApplied, showNutrition, setShowNutrition,
                         doneBy, setDoneBy, finishTime, setFinishTime, schedule, bumpStepStart,
                         onCookMode, onShop, comments, addComment, deleteComment,
                         allRecipes, onSaveRecipe, openRecipe, onSaveToLab,
                         authEmail, onEditRecipe, onDeleteRecipe, onBuildMealWith }) {
  const { t, tCourse, tOccasion, tDifficulty } = useLang();
  return (
    <>
      {/* Full-bleed hero */}
      <div className="recipe-magazine-hero" style={{ backgroundImage: `url(${recipe.photo})` }}>
        <div className="meta">
          <div>
            <div className="eyebrow">{tCourse(recipe.course).toUpperCase()} · {recipe.cuisine.toUpperCase()}</div>
            <h1>{recipe.title}</h1>
            <div className="sub">{recipe.subtitle}</div>
            <SourceLink recipe={recipe} />
            <div className="author-block">
              <div className="av">{recipe.author[0]}</div>
              <div>{t("aRecipeFrom")} <strong style={{ fontWeight: 500 }}>{recipe.author}</strong></div>
            </div>
          </div>
          <div className="rhs">
            <div style={{ fontSize: 28, fontFamily: "var(--serif)", fontStyle: "italic", marginBottom: 6 }}>{fmtDuration(scaled.totalTime)}</div>
            <div>{tDifficulty(recipe.difficulty).toUpperCase()} · {scaler.servings || `${scaler.weight} LB`}</div>
          </div>
        </div>
      </div>

      <TagRow recipe={recipe} scaled={scaled} />

      <StatsStrip
        recipe={recipe} scaler={scaler} scaled={scaled}
        finalNutrition={finalNutrition}
        showNutrition={showNutrition} setShowNutrition={setShowNutrition}
      />

      <div className="recipe-actions">
        <button className="btn primary" onClick={() => onCookMode(recipe, scaled.steps, finalIngs)}>
          <Icon name="play" /> {t("startCooking")}
        </button>
        <button className="btn" onClick={() => onShop([{ recipe, ings: finalIngs }])}>
          <Icon name="bowl" /> {t("shoppingList")}
        </button>
        <button className="btn ghost" onClick={() => window.print()}>
          <Icon name="print" /> {t("print")}
        </button>
        {authEmail && (
          <button className="btn ghost" onClick={() => onEditRecipe(recipe)}>
            <Icon name="edit" /> {t("edit")}
          </button>
        )}
      </div>

      <div className="section-break">
        <span className="label">The method</span>
      </div>

      <div className="recipe-body">
        <aside className="ingredients-panel">
          <IngredientsCard recipe={recipe} finalIngs={finalIngs} scaler={scaler} onShop={() => onShop([{ recipe, ings: finalIngs }])}>
            {FLAGS.adjust && <AIAdjustBox recipe={recipe} scaler={scaler} applied={applied} setApplied={setApplied} authEmail={authEmail} />}
          </IngredientsCard>
        </aside>

        <div>
          <TimingBar doneBy={doneBy} setDoneBy={setDoneBy} finishTime={finishTime} setFinishTime={setFinishTime} schedule={schedule} />
          <StepsList steps={scaled.steps} doneBy={doneBy} schedule={schedule} finishTime={finishTime} bumpStepStart={bumpStepStart} />
          {FLAGS.needHelp && <NeedHelp recipe={recipe} authEmail={authEmail} servings={scaler.servings} weight={scaler.weight} appliedAdjustments={applied} />}
        </div>
      </div>

      <PairingsSection recipe={recipe} allRecipes={allRecipes} openRecipe={openRecipe} onSaveRecipe={onSaveRecipe} onSaveToLab={onSaveToLab} onBuildMealWith={onBuildMealWith} authEmail={authEmail} />
      <div className="section-break">
        <span className="label">From the family</span>
      </div>
      <CooksNotes recipe={recipe} defaultOpen={true} scaler={scaler} applied={applied} setApplied={setApplied} onSaveRecipe={onSaveRecipe} authEmail={authEmail} />
      <CommentsPanel recipe={recipe} addComment={addComment} deleteComment={deleteComment} authEmail={authEmail} defaultOpen={false} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Variant: BINDER — recipe-card / scrapbook aesthetic
// ─────────────────────────────────────────────────────────────
function RecipeBinder({ recipe, scaler, scaled, finalIngs, finalNutrition,
                       applied, setApplied, showNutrition, setShowNutrition,
                       doneBy, setDoneBy, finishTime, setFinishTime, schedule, bumpStepStart,
                       onCookMode, onShop, comments, addComment, deleteComment,
                       allRecipes, onSaveRecipe, openRecipe,
                       authEmail, onEditRecipe, onDeleteRecipe }) {
  const { t, tCourse, tOccasion, tDifficulty } = useLang();
  return (
    <div className="recipe-binder">
      <div className="photo-binder" style={{ backgroundImage: `url(${recipe.photo})` }} />
      <div className="eyebrow" style={{ color: "var(--accent)" }}>
        From the kitchen of <strong style={{ fontWeight: 500, fontStyle: "italic" }}>{recipe.author}</strong>
      </div>
      <h1>{recipe.title}</h1>
      <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 18, color: "var(--ink-3)", maxWidth: "44ch" }}>
        {recipe.subtitle}
      </div>
      <SourceLink recipe={recipe} />

      <div className="recipe-meta-line">
        <span><strong>{tCourse(recipe.course)}</strong></span>
        <span>·</span>
        <span><strong>{recipe.cuisine}</strong></span>
        <span>·</span>
        <span>{t("prep")} <strong>{recipe.prep}min</strong></span>
        <span>{t("cook")} <strong>{scaled.cookMins}min</strong></span>
        <span>{t("total")} <strong>{fmtDuration(scaled.totalTime)}</strong></span>
        <span>·</span>
        <span><strong>{tDifficulty(recipe.difficulty)}</strong></span>
        <span>·</span>
        <span><strong>{scaler.servings || `${scaler.weight} lb`}</strong> {t("servingsLong")}</span>
      </div>

      <TagRow recipe={recipe} scaled={scaled} />

      <StatsStrip
        recipe={recipe} scaler={scaler} scaled={scaled}
        finalNutrition={finalNutrition}
        showNutrition={showNutrition} setShowNutrition={setShowNutrition}
      />

      <div className="recipe-actions">
        <button className="btn primary" onClick={() => onCookMode(recipe, scaled.steps, finalIngs)}>
          <Icon name="play" /> {t("startCooking")}
        </button>
        <button className="btn" onClick={() => onShop([{ recipe, ings: finalIngs }])}>
          <Icon name="bowl" /> {t("shoppingList")}
        </button>
        <button className="btn ghost" onClick={() => window.print()}>
          <Icon name="print" /> {t("print")}
        </button>
        {authEmail && (
          <button className="btn ghost" onClick={() => onEditRecipe(recipe)}>
            <Icon name="edit" /> {t("edit")}
          </button>
        )}
      </div>

      <div className="binder-body">
        <aside>
          <IngredientsCard recipe={recipe} finalIngs={finalIngs} scaler={scaler} onShop={() => onShop([{ recipe, ings: finalIngs }])}>
            {FLAGS.adjust && <AIAdjustBox recipe={recipe} scaler={scaler} applied={applied} setApplied={setApplied} authEmail={authEmail} />}
          </IngredientsCard>
        </aside>
        <div>
          <h3 style={{ marginBottom: 14, fontStyle: "italic" }}>How to make it</h3>
          <TimingBar doneBy={doneBy} setDoneBy={setDoneBy} finishTime={finishTime} setFinishTime={setFinishTime} schedule={schedule} />
          <StepsList steps={scaled.steps} doneBy={doneBy} schedule={schedule} finishTime={finishTime} bumpStepStart={bumpStepStart} />
          {FLAGS.needHelp && <NeedHelp recipe={recipe} authEmail={authEmail} servings={scaler.servings} weight={scaler.weight} appliedAdjustments={applied} />}
        </div>
      </div>

      <div className="section-break">
        <span className="label">Margin notes</span>
      </div>
      <CooksNotes recipe={recipe} defaultOpen={true} scaler={scaler} applied={applied} setApplied={setApplied} onSaveRecipe={onSaveRecipe} authEmail={authEmail} />
      <CommentsPanel recipe={recipe} addComment={addComment} deleteComment={deleteComment} authEmail={authEmail} defaultOpen={false} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Top-level Recipe detail — holds all state, picks the variant
// ─────────────────────────────────────────────────────────────
export function RecipeDetail({ recipe, variant, allRecipes, onBack, onCookMode, onShop, comments, addComment, deleteComment, onSaveRecipe, onOpenRecipe, onSaveToLab, authEmail, onEditRecipe, onDeleteRecipe, onBuildMealWith }) {
  const { t } = useLang();
  // Scaling state
  const [servings, setServings] = useState(recipe.servingsDefault);
  const [weight, setWeight] = useState(recipe.weightDefault || 1);
  const [calTarget, setCalTarget] = useState(recipe.nutrition.cal);
  const [applied, setApplied] = useState([]);
  const [showNutrition, setShowNutrition] = useState(false); // collapsed by default
  const [doneBy, setDoneBy] = useState(false);

  // Default finish time = 6pm today
  const [finishTime, setFinishTime] = useState(() => {
    const d = new Date(); d.setHours(18, 0, 0, 0); return d;
  });

  // Reset when recipe changes
  useEffect(() => {
    setServings(recipe.servingsDefault);
    setWeight(recipe.weightDefault || 1);
    setCalTarget(recipe.nutrition.cal);
    setApplied([]);
  }, [recipe.id]);

  // Compute scaled ingredients & steps
  const scaled = useMemo(() => {
    const isWeight = recipe.scaleBy === "weight";
    let ings, steps, cookMins;
    if (isWeight) {
      const r = scaleByWeight(recipe, weight);
      ings = r.ings; steps = r.steps; cookMins = r.cookMins;
    } else {
      const factor = servings / recipe.servingsDefault;
      ings = scaleIngredients(recipe.ingredients, factor);
      steps = recipe.steps.map(s => ({ ...s, d: s.d.replace("{COOKMINS}", s.mins) }));
      cookMins = recipe.cook;
    }
    const totalTime = steps.reduce((s, x) => s + (x.mins || 0), 0) + (recipe.prep || 0);
    return { ings, steps, cookMins, totalTime };
  }, [recipe, servings, weight]);

  // Calorie adjustment factor on top. Falls back to 1 when the recipe
  // doesn't have a baseline (e.g. AI-extracted with no nutrition, or an
  // older entry) so the math doesn't divide by zero and the stats
  // strip doesn't render NaN.
  const calFactor = recipe.nutrition?.cal ? calTarget / recipe.nutrition.cal : 1;
  const finalIngs = useMemo(() => scaleIngredients(scaled.ings, calFactor), [scaled.ings, calFactor]);
  const finalNutrition = useMemo(() => {
    const n = recipe.nutrition;
    const f = calFactor;
    return {
      cal: Math.round(n.cal * f), protein: Math.round(n.protein * f),
      carbs: Math.round(n.carbs * f), fat: Math.round(n.fat * f),
      fiber: Math.round(n.fiber * f), sodium: Math.round(n.sodium * f),
    };
  }, [recipe.nutrition, calFactor]);

  // Schedule
  const baseSchedule = useMemo(() =>
    doneBy ? scheduleForFinish(scaled.steps, finishTime) : null,
  [doneBy, scaled.steps, finishTime]);

  // Per-step start-time overrides on the recipe page. Each entry is the
  // start time the user has nudged a step to; subsequent steps then flow
  // forward from there so the rest of the schedule shifts to match.
  // Lives in component state — resets when navigating away.
  const [stepStartOverrides, setStepStartOverrides] = useState({});
  useEffect(() => { setStepStartOverrides({}); }, [recipe.id, finishTime, doneBy]);

  const schedule = useMemo(() => {
    if (!baseSchedule) return null;
    const out = new Array(scaled.steps.length);
    let prevEnd = null;
    for (let i = 0; i < scaled.steps.length; i++) {
      const ovr = stepStartOverrides[i];
      const start = ovr
        ? new Date(ovr)
        : prevEnd != null ? new Date(prevEnd) : new Date(baseSchedule.schedule[i].start);
      const end = new Date(start.getTime() + (scaled.steps[i].mins || 0) * 60000);
      out[i] = { ...baseSchedule.schedule[i], start, end };
      prevEnd = end.getTime();
    }
    return { ...baseSchedule, schedule: out, startTime: out[0]?.start || baseSchedule.startTime };
  }, [baseSchedule, scaled.steps, stepStartOverrides]);

  const bumpStepStart = (i, deltaMin) => {
    if (!schedule) return;
    const next = new Date(schedule.schedule[i].start.getTime() + deltaMin * 60000);
    setStepStartOverrides(o => ({ ...o, [i]: next.toISOString() }));
  };

  const scaler = { servings, setServings, weight, setWeight, calTarget, setCalTarget };

  const variantProps = {
    recipe, scaler, scaled, finalIngs, finalNutrition,
    applied, setApplied, showNutrition, setShowNutrition,
    doneBy, setDoneBy, finishTime, setFinishTime, schedule, bumpStepStart,
    onCookMode, onShop, comments, addComment, deleteComment,
    allRecipes, onSaveRecipe, onSaveToLab,
    openRecipe: onOpenRecipe || ((r) => {}),
    authEmail, onEditRecipe, onDeleteRecipe, onBuildMealWith,
  };

  return (
    <div className="app" data-screen-label={`02 Recipe: ${recipe.title}`}>
      <button className="btn ghost" onClick={onBack} style={{ marginBottom: 24 }}>
        <Icon name="chevL" /> {t("backToCookbook")}
      </button>

      {variant === "magazine" && <RecipeMagazine {...variantProps} />}
      {variant === "binder" && <RecipeBinder {...variantProps} />}
      {(!variant || variant === "editorial") && <RecipeEditorial {...variantProps} />}

      {/* Simplified print layout — only rendered in the print
          stylesheet (the rest of the app is hidden via #root). */}
      <PrintOnly>
        <RecipePrintView recipe={recipe} ings={finalIngs} servings={scaler.servings} />
      </PrintOnly>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RecipePrintView — what shows up on paper. Small photo, two
// columns (ingredients + steps), tips list at the bottom.
// Scaled to the cook's current servings so the printed list
// matches whatever they set on screen.
// ─────────────────────────────────────────────────────────────
function RecipePrintView({ recipe, ings, servings }) {
  const grouped = (ings || []).reduce((acc, ing) => {
    const k = ing.grp || "Ingredients";
    if (k === "Serve") return acc;
    (acc[k] = acc[k] || []).push(ing);
    return acc;
  }, {});
  return (
    <div className="print-recipe">
      <div className="print-header">
        <div className="print-text">
          <h1>{recipe.title}</h1>
          {recipe.subtitle && <p className="sub">{recipe.subtitle}</p>}
          <div className="meta">
            {recipe.scaleBy !== "weight" && <span>Serves {servings}</span>}
            <span>{fmtDuration(recipe.total)}</span>
            {recipe.author && <span>{recipe.author}</span>}
            {recipe.cuisine && <span>{recipe.cuisine}</span>}
          </div>
        </div>
        {recipe.photo && (
          <div className="print-photo" style={{ backgroundImage: `url(${recipe.photo})` }} />
        )}
      </div>
      <div className="print-columns">
        <div className="print-col print-ingredients">
          <h2>Ingredients</h2>
          {Object.entries(grouped).map(([grp, items]) => (
            <div className="print-group" key={grp}>
              {Object.keys(grouped).length > 1 && <h3>{grp}</h3>}
              <ul>
                {items.map((i, idx) => (
                  <li key={idx}>
                    <span className="qty">{formatQty(i.qty)} {i.unit}</span> {i.item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="print-col print-steps">
          <h2>Steps</h2>
          <ol>
            {(recipe.steps || []).map((s, i) => (
              <li key={i}>
                {s.t && <strong>{s.t}. </strong>}
                {s.d}
              </li>
            ))}
          </ol>
        </div>
      </div>
      {recipe.tips?.length > 0 && (
        <div className="print-tips">
          <h2>Tips</h2>
          <ul>
            {recipe.tips.map((tip, i) => <li key={i}>{tip}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

