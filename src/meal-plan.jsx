// Meal plan flow
// 1. PlanMealModal — pick a finish date+time
// 2. MealPlanPage   — combined timeline + per-recipe tabs

import { useState, useEffect, useMemo, Fragment } from "react";
import { Icon, fmtDuration, fmtTime, logEvent, scheduleForFinish } from "./helpers.jsx";
import { Modal } from "./ui.jsx";
import { useLang } from "./i18n.js";
import { NeedHelp } from "./need-help.jsx";

// ─────────────────────────────────────────────────────────────
// PlanMealModal — entry point. Asks "when do you want this done by"
// ─────────────────────────────────────────────────────────────
export function PlanMealModal({ open, onClose, recipes, onConfirm }) {
  const { t, locale } = useLang();
  // Default = today @ 6pm
  const [finishTime, setFinishTime] = useState(() => {
    const d = new Date(); d.setHours(18, 0, 0, 0); return d;
  });
  // Adjustable: when to start the "make the night before" prep for any
  // recipes that have an overnight rest. Defaults to 7pm.
  const [eveningHour, setEveningHour] = useState(19);

  const dateStr = `${finishTime.getFullYear()}-${String(finishTime.getMonth() + 1).padStart(2, "0")}-${String(finishTime.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(finishTime.getHours()).padStart(2, "0")}:${String(finishTime.getMinutes()).padStart(2, "0")}`;

  const updateDate = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    const nx = new Date(finishTime); nx.setFullYear(y, m - 1, d);
    setFinishTime(nx);
  };
  const updateTime = (s) => {
    const [h, m] = s.split(":").map(Number);
    const nx = new Date(finishTime); nx.setHours(h, m, 0, 0);
    setFinishTime(nx);
  };

  const preset = (label, h, m, dayOffset = 0) => {
    const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0);
    setFinishTime(d);
  };

  // Per-recipe back-scheduled start times — the same logic the meal plan
  // page will use, so the "you'll start at" pill matches reality, including
  // multi-day overnight handling.
  const perRecipe = useMemo(() => recipes.map(r => ({
    recipe: r,
    ...scheduleForFinish(r.steps, finishTime, { eveningHour }),
  })), [recipes, finishTime, eveningHour]);

  // Earliest start across all recipes, with day offset.
  const earliest = perRecipe.reduce((best, p) => {
    return !best || p.startTime < best.startTime ? p : best;
  }, null);
  const earliestStartByDate = earliest ? earliest.startTime : finishTime;
  const earliestOffset = earliest?.schedule?.[0]?.dayOffset ?? 0;
  const overnightRecipes = perRecipe.filter(p => p.schedule.some(s => s.overnight));
  const hasOvernight = overnightRecipes.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("planYourMeal")}
      subtitle={`${recipes.length} ${recipes.length === 1 ? t("recipe") : t("recipes")} \u2014 ${t("staggerSubtitle")}`}
      size="lg"
      footer={
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button className="btn" onClick={onClose}>{t("cancel")}</button>
          <button className="btn primary" onClick={() => onConfirm(finishTime, { eveningHour })}>
            <Icon name="play" /> {t("buildSchedule")}
          </button>
        </div>
      }
    >
      <div className="meal-plan-modal-body">
        <div className="when">
          <div>
            <label>{t("date")}</label>
            <input type="date" value={dateStr} onChange={(e) => updateDate(e.target.value)} />
          </div>
          <div>
            <label>{t("time")}</label>
            <input type="time" value={timeStr} onChange={(e) => updateTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label>{t("orPickAPreset")}</label>
          <div className="preset-times">
            <button className="chip" onClick={() => preset("Lunch today", 12, 30)}>{t("lunchToday")} (12:30)</button>
            <button className="chip" onClick={() => preset("Dinner today", 18, 0)}>{t("dinnerToday")} (6:00)</button>
            <button className="chip" onClick={() => preset("Late dinner", 19, 30)}>{t("lateDinner")} (7:30)</button>
            <button className="chip" onClick={() => preset("Tomorrow 6pm", 18, 0, 1)}>{t("tomorrow")} (6:00)</button>
            <button className="chip" onClick={() => preset("Sat dinner", 18, 0, ((6 - new Date().getDay() + 7) % 7) || 7)}>{t("saturday")} (6:00)</button>
          </div>
        </div>

        <div className="recipes-list">
          <label>{t("onTheMenu")}</label>
          {recipes.map(r => (
            <div className="recipe-pill" key={r.id}>
              <div className="photo" style={{ backgroundImage: `url(${r.photoCard || r.photo})` }} />
              <div>
                <div className="name">{r.title}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{t("by")} {r.author}</div>
              </div>
              <div className="duration">{fmtDuration(r.total)}</div>
            </div>
          ))}
        </div>

        {hasOvernight && (
          <div className="overnight-suggestion">
            <div className="head">
              <Icon name="clock" size={14} />
              <strong>{t("needsHeadStartTitle")}</strong>
            </div>
            <p>
              {overnightRecipes.map(p => p.recipe.title).join(" / ")}{" "}
              {overnightRecipes.length === 1 ? t("has") : t("have")} {t("overnightSentenceMid")} {fmtTime(earliestStartByDate)} {t("overnightSentenceEnd")}
            </p>
            <div className="evening-picker">
              <input
                type="time"
                value={`${String(eveningHour).padStart(2, "0")}:00`}
                onChange={(e) => {
                  const [h] = e.target.value.split(":").map(Number);
                  if (!Number.isNaN(h)) setEveningHour(h);
                }}
              />
              <span>{t("theDayBefore")}</span>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "14px 16px", background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: "var(--radius)" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600 }}>{t("youllStartAt")}</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 24, color: "var(--accent)", marginTop: 4 }}>
              {earliestOffset < 0
                ? `${earliestStartByDate.toLocaleDateString(locale, { weekday: "long" })} ${fmtTime(earliestStartByDate)}`
                : fmtTime(earliestStartByDate)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600 }}>{t("andEatAt")}</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 24, color: "var(--ink)", marginTop: 4 }}>{fmtTime(finishTime)}</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// MealPlanPage — combined timeline + per-recipe tabs
// ─────────────────────────────────────────────────────────────
const RECIPE_COLORS = ["#b04a2a", "#6e7a3a", "#3a5a6a", "#d68a2a", "#8a3a5a"];

export function MealPlanPage({ recipes, finishTime, eveningHour = 19, onClose, onCookMode, onShop, authEmail }) {
  const { t, locale } = useLang();
  const [tab, setTab] = useState("combined");
  const [cookOpen, setCookOpen] = useState(false);

  // Per-step start overrides. Shape: { [recipeId]: { [stepIdx]: ISOString } }.
  // When a cook bumps a step ±5 minutes, we store the new start time here
  // and cascade subsequent steps forward (same mechanic as cook mode).
  // Finish time slides — the original "all ready by" stays as the
  // intended target, the timeline shows the actual current plan.
  const [stepOverrides, setStepOverrides] = useState({});

  useEffect(() => { logEvent("meal-plan-open"); }, []);

  // Each recipe gets its own back-scheduled timeline. If the recipe has
  // step overrides, walk forward applying them and cascade following
  // steps from the override end rather than the back-scheduled start.
  const perRecipe = useMemo(() => {
    return recipes.map((r, ri) => {
      const base = scheduleForFinish(r.steps, finishTime, { eveningHour });
      const overrides = stepOverrides[r.id] || {};
      const hasAnyOverride = Object.keys(overrides).length > 0;
      if (!hasAnyOverride) {
        return {
          recipe: r, idx: ri, color: RECIPE_COLORS[ri % RECIPE_COLORS.length],
          schedule: base.schedule, startTime: base.startTime,
        };
      }
      const adjusted = new Array(r.steps.length);
      let prevEnd = null;
      for (let i = 0; i < r.steps.length; i++) {
        const overrideRaw = overrides[i];
        const start = overrideRaw
          ? new Date(overrideRaw)
          : prevEnd != null ? new Date(prevEnd) : new Date(base.schedule[i].start);
        const mins = r.steps[i].mins || 0;
        const end = new Date(start.getTime() + mins * 60000);
        adjusted[i] = { ...base.schedule[i], start, end };
        prevEnd = end.getTime();
      }
      return {
        recipe: r, idx: ri, color: RECIPE_COLORS[ri % RECIPE_COLORS.length],
        schedule: adjusted, startTime: adjusted[0]?.start || base.startTime,
      };
    });
  }, [recipes, finishTime, eveningHour, stepOverrides]);

  // Bump a step's start time by ±N minutes. Persists as an override
  // which cascades through subsequent steps via the memo above.
  const bumpStep = (recipeId, stepIdx, deltaMin) => {
    const rec = perRecipe.find(p => p.recipe.id === recipeId);
    if (!rec) return;
    const currentStart = rec.schedule[stepIdx].start;
    const newStart = new Date(currentStart.getTime() + deltaMin * 60000);
    setStepOverrides(prev => ({
      ...prev,
      [recipeId]: { ...(prev[recipeId] || {}), [stepIdx]: newStart.toISOString() },
    }));
  };

  const hasOverrides = Object.values(stepOverrides).some(o => Object.keys(o).length > 0);
  const resetOverrides = () => setStepOverrides({});

  // Where the meal actually finishes after any bumps. Used to show
  // slip if the cook has pushed steps later.
  const actualFinish = useMemo(() => {
    let latest = finishTime;
    for (const p of perRecipe) {
      const last = p.schedule[p.schedule.length - 1]?.end;
      if (last && last > latest) latest = last;
    }
    return latest;
  }, [perRecipe, finishTime]);
  const slipMin = Math.round((actualFinish - finishTime) / 60000);

  // Combined timeline = all steps from all recipes, interleaved chronologically
  const combined = useMemo(() => {
    const flat = [];
    perRecipe.forEach(({ recipe, idx, color, schedule }) => {
      recipe.steps.forEach((s, si) => {
        flat.push({
          ri: idx,
          recipe,
          color,
          step: s,
          si,
          stepIdx: si + 1,
          start: schedule[si].start,
          end: schedule[si].end,
        });
      });
    });
    flat.sort((a, b) => a.start - b.start);
    return flat;
  }, [perRecipe]);

  // The single earliest start time across all recipes
  const earliestStart = combined.length ? combined[0].start : finishTime;

  // Group combined into time-buckets for cleaner display (15-min granularity)
  const grouped = useMemo(() => {
    const out = [];
    let lastKey = "";
    for (const e of combined) {
      const key = fmtTime(e.start);
      if (key !== lastKey) {
        out.push({ key, time: e.start, items: [] });
        lastKey = key;
      }
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [combined]);

  const totalTime = (finishTime - earliestStart) / 60000;

  return (
    <div className="meal-plan-page" data-screen-label={`06 Meal Plan: ${recipes.map(r => r.title).join(" + ")}`}>
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> {t("backToCookbook")}
      </button>

      <div className="meal-plan-header">
        <div>
          <div className="eyebrow">{t("tonightsPlan")}</div>
          <h1>{recipes.map(r => r.title).join(" + ")}</h1>
          <div className="summary">
            {recipes.length} {recipes.length === 1 ? t("dish") : t("dishes")} · {fmtDuration(totalTime)} {t("aboutXOfCooking")} · {t("staggeredSo")} {fmtTime(finishTime)}.
          </div>
        </div>
        <div className="rhs">
          <div className="clock-big">{fmtTime(actualFinish)}</div>
          <div className="clock-small">
            {t("allReadyBy")}
            {slipMin > 0 && (
              <span style={{ color: "#933", marginLeft: 6 }}>
                (+{slipMin} min vs plan)
              </span>
            )}
            {slipMin < 0 && (
              <span style={{ color: "var(--accent-cool)", marginLeft: 6 }}>
                ({slipMin} min vs plan)
              </span>
            )}
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button className="btn primary sm" onClick={() => setCookOpen(true)}>
              <Icon name="play" size={12} /> Cook this meal
            </button>
            <button className="btn sm" onClick={() => onShop(recipes.map(r => ({ recipe: r, ings: r.ingredients })))}>
              <Icon name="bowl" size={12} /> {t("shoppingList")}
            </button>
            <button className="btn ghost sm"><Icon name="print" size={12} /> {t("print")}</button>
            {hasOverrides && (
              <button className="btn ghost sm" onClick={resetOverrides} title="Clear all time adjustments and snap back to the planned schedule">
                Reset adjustments
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recipe legend */}
      <div className="recipe-legend" style={{ marginTop: 24 }}>
        {perRecipe.map(({ recipe, color, startTime }) => (
          <div key={recipe.id} className="item">
            <div className="swatch" style={{ background: color }} />
            <div>
              <span className="name">{recipe.title}</span>{" "}
              <span className="dur">starts {fmtTime(startTime)} · {fmtDuration(recipe.total)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="meal-plan-tabs">
        <button className={tab === "combined" ? "on" : ""} onClick={() => setTab("combined")}>
          <Icon name="list" size={13} /> {t("combinedTimeline")}
          <span className="num">{combined.length}</span>
        </button>
        {perRecipe.map(({ recipe, color }) => (
          <button
            key={recipe.id}
            className={tab === recipe.id ? "on" : ""}
            onClick={() => setTab(recipe.id)}
          >
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: color, marginRight: 4 }} />
            {recipe.title}
          </button>
        ))}
      </div>

      {tab === "combined" && (
        <CombinedTimeline
          grouped={grouped}
          finishTime={finishTime}
          stepOverrides={stepOverrides}
          bumpStep={bumpStep}
        />
      )}
      {tab !== "combined" && (
        <PerRecipeView
          rec={perRecipe.find(p => p.recipe.id === tab)}
          onCookMode={onCookMode}
        />
      )}

      {/* Ask the kitchen AI about the whole meal — substitutions,
          scaling, what to prep first, etc. Lives at the bottom of
          either tab. */}
      <div style={{ marginTop: 40 }}>
        <NeedHelp recipes={recipes} authEmail={authEmail} defaultOpen={false} />
      </div>

      <MealCookMode
        open={cookOpen}
        onClose={() => setCookOpen(false)}
        combined={combined}
        grouped={grouped}
        perRecipe={perRecipe}
        recipes={recipes}
        authEmail={authEmail}
      />
    </div>
  );
}

function CombinedTimeline({ grouped, finishTime, stepOverrides, bumpStep }) {
  const { t, locale } = useLang();
  // Compute earliest item across groups so we can label day transitions
  // and gaps with a meaningful "previous day"/"day of" label.
  const finishDay = new Date(finishTime); finishDay.setHours(0, 0, 0, 0);
  const dayOffsetOf = (d) => {
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    return Math.round((day - finishDay) / 86400000);
  };
  const labelForOffset = (off) => {
    const d = new Date(finishDay);
    d.setDate(d.getDate() + off);
    const weekday = d.toLocaleDateString(locale, { weekday: "long" });
    return off === 0 ? `${weekday} — ${t("dayOf")}` : off === -1 ? `${weekday} — ${t("dayBefore")}` : weekday;
  };

  let lastEndTime = null;
  let lastDayOffset = null;

  return (
    <div className="combined-timeline">
      {grouped.map((g, gi) => {
        const groupOffset = dayOffsetOf(g.time);
        const dayChanged = lastDayOffset !== null && groupOffset !== lastDayOffset;
        const showDay = lastDayOffset === null || dayChanged;
        const gapMin = lastEndTime ? Math.round((g.time - lastEndTime) / 60000) : 0;
        const showBreak = !dayChanged && gapMin >= 30;
        const breakHuman = gapMin >= 60
          ? `${Math.floor(gapMin / 60)}h ${gapMin % 60 ? (gapMin % 60) + "m" : ""}`.trim()
          : `${gapMin} min`;

        // Update tracking. The "lastEndTime" advances to whichever item in
        // this group ends last.
        const groupLastEnd = g.items.reduce((m, it) => it.end > m ? it.end : m, g.time);

        const node = (
          <Fragment key={gi}>
            {showDay && (
              <div className="timeline-day">{labelForOffset(groupOffset)}</div>
            )}
            {showBreak && (
              <div className="timeline-break">
                <Icon name="clock" size={14} />
                <div>
                  <strong>{breakHuman} {t("untilYourNextStep")}</strong>
                  <span style={{ marginLeft: 6, color: "var(--ink-3)" }}>{t("takeABreak")}</span>
                </div>
              </div>
            )}
            <div className="timeline-marker">
              <Icon name="clock" size={13} /> {g.key}
              {bumpStep && (
                <span className="time-bump">
                  <button
                    type="button"
                    onClick={() => g.items.forEach(it => bumpStep(it.recipe.id, it.si, -5))}
                    aria-label="Shift this time slot 5 minutes earlier"
                    title="Shift this time slot 5 minutes earlier"
                  ><Icon name="minus" size={10} /></button>
                  <button
                    type="button"
                    onClick={() => g.items.forEach(it => bumpStep(it.recipe.id, it.si, 5))}
                    aria-label="Shift this time slot 5 minutes later"
                    title="Shift this time slot 5 minutes later"
                  ><Icon name="plus" size={10} /></button>
                </span>
              )}
            </div>
            {g.items.map((it, ii) => {
              const isAdjusted = !!stepOverrides?.[it.recipe.id]?.[it.si];
              return (
                <div className="timeline-row" data-rc={it.ri} key={`${gi}-${ii}`}>
                  <div className="when-col">
                    <span style={{ color: isAdjusted ? "var(--accent)" : undefined }}>
                      {fmtTime(it.start)}
                    </span>
                    <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>→ {fmtTime(it.end)}</div>
                  </div>
                  <div className="step-card">
                    <div>
                      <div className="recipe-label">{it.recipe.title} · step {it.stepIdx}</div>
                      <div className="step-title">{it.step.t}</div>
                      <div className="step-desc">{it.step.d}</div>
                    </div>
                    <div className="duration">
                      {fmtDuration(it.step.mins)}
                      <div className={`precision precision-${it.step.precision}`} style={{ marginTop: 4 }}>● {it.step.precision}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </Fragment>
        );

        lastDayOffset = groupOffset;
        lastEndTime = groupLastEnd;
        return node;
      })}
    </div>
  );
}

function PerRecipeView({ rec, onCookMode }) {
  const { recipe, color, schedule, startTime } = rec;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 32, marginBottom: 32 }}>
        <div style={{ aspectRatio: "4/5", backgroundImage: `url(${recipe.photo})`, backgroundSize: "cover", backgroundPosition: "center", borderRadius: "var(--radius-lg)" }} />
        <div>
          <div className="eyebrow" style={{ color }}>{recipe.course} · {recipe.cuisine}</div>
          <h2 style={{ margin: "6px 0 10px" }}>{recipe.title}</h2>
          <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-3)" }}>{recipe.subtitle}</div>
          <div style={{ marginTop: 16, padding: 14, background: "var(--paper-2)", borderRadius: "var(--radius)", display: "flex", gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>Start at</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 22, color }}>{fmtTime(startTime)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>Total</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 22 }}>{fmtDuration(recipe.total)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>Difficulty</div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontStyle: "italic" }}>{recipe.difficulty}</div>
            </div>
            <button className="btn primary" style={{ marginLeft: "auto", alignSelf: "center" }} onClick={() => onCookMode(recipe, recipe.steps, recipe.ingredients)}>
              <Icon name="play" /> Cook this
            </button>
          </div>
        </div>
      </div>

      <h3 style={{ marginBottom: 16 }}>Steps with start times</h3>
      <div className="steps-list">
        {recipe.steps.map((s, i) => (
          <div className="step" key={i}>
            <div className="n" style={{ color }}>{String(i + 1).padStart(2, "0")}</div>
            <div>
              <div className="t">{s.t}</div>
              <div className="d">{s.d}</div>
              <div className="meta">
                <span className={`precision-${s.precision}`}>● {s.precision}</span>
                <span className="time">{fmtDuration(s.mins)}</span>
                <span className="start" style={{ background: `${color}1a`, color }}>
                  ▶ {fmtTime(schedule[i].start)} – {fmtTime(schedule[i].end)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MealCookMode — focus mode for a multi-recipe meal.
// Iterates by TIME GROUP (not individual step), so concurrent
// steps from different recipes show side-by-side and the cook
// can work on multiple things in tandem. Layout mirrors the
// single-recipe cook mode (big title, body, footer nav, AI help
// as a blue toggle) but without the left-side timeline — the
// coloured-square strip across the top serves the same purpose
// and stays simpler for parallel cooking.
// ─────────────────────────────────────────────────────────────
function MealCookMode({ open, onClose, combined, grouped, perRecipe, recipes, authEmail }) {
  const [gIdx, setGIdx] = useState(0);
  const [done, setDone] = useState({});       // keyed by combined-index
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (open) { setGIdx(0); setDone({}); setHelpOpen(false); }
  }, [open]);
  // Reset the AI help panel when the active group changes — fresh
  // group, fresh conversation.
  useEffect(() => { setHelpOpen(false); }, [gIdx]);

  if (!open || !grouped?.length) return null;
  const curGroup = grouped[gIdx];
  const totalGroups = grouped.length;
  const isLast = gIdx === totalGroups - 1;
  // Combined-index of every item in the current group, used to
  // toggle done state when the cook moves forward / back.
  const curIndices = curGroup.items.map(it => combined.indexOf(it));

  const goNext = () => {
    setDone(d => {
      const next = { ...d };
      curIndices.forEach(i => { next[i] = true; });
      return next;
    });
    if (!isLast) setGIdx(g => g + 1);
  };
  const goPrev = () => {
    if (gIdx === 0) return;
    const prevGroup = grouped[gIdx - 1];
    const prevIndices = prevGroup.items.map(it => combined.indexOf(it));
    setDone(d => {
      const next = { ...d };
      prevIndices.forEach(i => { delete next[i]; });
      return next;
    });
    setGIdx(g => g - 1);
  };

  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Time slot ${gIdx + 1} of ${totalGroups} · ${curGroup.key}`}
      subtitle={recipes.map(r => r.title).join(" + ")}
      size="lg"
      footer={
        <>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {doneCount} of {combined.length} steps done
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={goPrev} disabled={gIdx === 0}>
              <Icon name="chevL" /> Previous
            </button>
            <button className="btn primary" onClick={goNext}>
              {isLast ? <>Mark done <Icon name="check" /></> : <>Next time slot <Icon name="chevR" /></>}
            </button>
          </div>
        </>
      }
    >
      <div style={{ padding: "4px 0" }}>
        {/* Mini-timeline of every step in the meal, grouped visually
            by time slot. Squares in the current slot are highlighted;
            completed slots fade. Tapping a square jumps to that slot. */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
          {grouped.map((g, gi) => (
            <div key={gi} style={{ display: "flex", gap: 3 }}>
              {g.items.map((it) => {
                const ci = combined.indexOf(it);
                const cm = perRecipe.find(p => p.recipe.id === it.recipe.id);
                const dot = cm?.color || "var(--ink-3)";
                const active = gi === gIdx;
                const completed = !!done[ci];
                return (
                  <button
                    key={ci}
                    onClick={() => setGIdx(gi)}
                    title={`${it.recipe.title} · step ${it.stepIdx}: ${it.step.t}`}
                    style={{
                      width: 22, height: 22, borderRadius: 4,
                      background: completed ? dot : active ? dot : "transparent",
                      opacity: completed ? 0.55 : active ? 1 : 0.45,
                      border: `1px solid ${dot}`,
                      cursor: "pointer", padding: 0,
                      outline: active ? "2px solid var(--ink)" : "none",
                      outlineOffset: 2,
                    }}
                    aria-label={`Jump to step ${ci + 1}`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Concurrent steps in this time slot. Single step → one big
            card; multiple → stack them so the cook can work in
            parallel. Recipe colour codes each card so it's obvious
            which dish a step belongs to at a glance. */}
        <div style={{ display: "grid", gap: 16 }}>
          {curGroup.items.map((it, ii) => {
            const cm = perRecipe.find(p => p.recipe.id === it.recipe.id);
            const color = cm?.color || "var(--ink)";
            return (
              <div
                key={ii}
                style={{
                  borderLeft: `4px solid ${color}`,
                  paddingLeft: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6, fontSize: 12 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: color }} />
                  <strong style={{ fontFamily: "var(--serif)", fontSize: 13 }}>{it.recipe.title}</strong>
                  <span style={{ color: "var(--ink-3)" }}>· step {it.stepIdx} of {it.recipe.steps.length}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", color: "var(--ink-3)" }}>
                    {fmtTime(it.start)} → {fmtTime(it.end)} · {fmtDuration(it.step.mins)}
                  </span>
                </div>
                <h2 style={{ margin: "4px 0 8px", fontFamily: "var(--serif)", fontSize: curGroup.items.length === 1 ? 26 : 20 }}>
                  {it.step.t}
                </h2>
                <p style={{ fontFamily: "var(--serif)", fontSize: curGroup.items.length === 1 ? 17 : 15, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>
                  {it.step.d}
                </p>
              </div>
            );
          })}
        </div>

        {/* Ask AI — single button per slot, matching single-recipe
            cook mode visually. Passes the whole meal as context so
            the model can answer cross-recipe questions ("can I
            substitute X across both dishes?"). */}
        <div style={{ marginTop: 28 }}>
          <button
            className="btn ai"
            onClick={() => setHelpOpen(o => !o)}
          >
            <Icon name="sparkle" size={13} /> {helpOpen ? "Hide help" : "Need help with this step?"}
          </button>
          {helpOpen && (
            <div style={{ marginTop: 12 }}>
              <NeedHelp
                key={gIdx /* reset turns on slot change */}
                recipes={recipes}
                currentStep={curGroup.items[0]?.step}
                compact
                defaultOpen={true}
                authEmail={authEmail}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

