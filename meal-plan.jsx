// Meal plan flow
// 1. PlanMealModal — pick a finish date+time
// 2. MealPlanPage   — combined timeline + per-recipe tabs

const { useState, useMemo } = React;

// ─────────────────────────────────────────────────────────────
// PlanMealModal — entry point. Asks "when do you want this done by"
// ─────────────────────────────────────────────────────────────
function PlanMealModal({ open, onClose, recipes, onConfirm }) {
  // Default = today @ 6pm
  const [finishTime, setFinishTime] = useState(() => {
    const d = new Date(); d.setHours(18, 0, 0, 0); return d;
  });

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

  // Longest individual recipe = the earliest "must start by"
  const longest = recipes.reduce((s, r) => Math.max(s, r.total), 0);
  const startByDate = new Date(finishTime.getTime() - longest * 60000);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Plan your meal"
      subtitle={`${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"} \u2014 we'll back-time the schedule so everything lands at once.`}
      size="lg"
      footer={
        <>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            <Icon name="sparkle" size={11} /> AI staggers prep so nothing gets cold.
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={() => onConfirm(finishTime)}>
              <Icon name="play" /> Build the schedule
            </button>
          </div>
        </>
      }
    >
      <div className="meal-plan-modal-body">
        <div className="when">
          <div>
            <label>Date</label>
            <input type="date" value={dateStr} onChange={(e) => updateDate(e.target.value)} />
          </div>
          <div>
            <label>Time</label>
            <input type="time" value={timeStr} onChange={(e) => updateTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label>Or pick a preset</label>
          <div className="preset-times">
            <button className="chip" onClick={() => preset("Lunch today", 12, 30)}>Lunch today (12:30)</button>
            <button className="chip" onClick={() => preset("Dinner today", 18, 0)}>Dinner today (6:00)</button>
            <button className="chip" onClick={() => preset("Late dinner", 19, 30)}>Late dinner (7:30)</button>
            <button className="chip" onClick={() => preset("Tomorrow 6pm", 18, 0, 1)}>Tomorrow (6:00)</button>
            <button className="chip" onClick={() => preset("Sat dinner", 18, 0, ((6 - new Date().getDay() + 7) % 7) || 7)}>Saturday (6:00)</button>
          </div>
        </div>

        <div className="recipes-list">
          <label>On the menu</label>
          {recipes.map(r => (
            <div className="recipe-pill" key={r.id}>
              <div className="photo" style={{ backgroundImage: `url(${r.photo})` }} />
              <div>
                <div className="name">{r.title}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>by {r.author}</div>
              </div>
              <div className="duration">{fmtDuration(r.total)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "14px 16px", background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: "var(--radius)" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600 }}>You'll start at</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 24, color: "var(--accent)", marginTop: 4 }}>{fmtTime(startByDate)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600 }}>And eat at</div>
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

function MealPlanPage({ recipes, finishTime, onClose, onCookMode, onShop }) {
  const [tab, setTab] = useState("combined");

  // Each recipe gets its own back-scheduled timeline
  const perRecipe = useMemo(() => {
    return recipes.map((r, ri) => {
      const { schedule, startTime } = scheduleForFinish(r.steps, finishTime);
      return {
        recipe: r, idx: ri, color: RECIPE_COLORS[ri % RECIPE_COLORS.length],
        schedule, startTime,
      };
    });
  }, [recipes, finishTime]);

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
        <Icon name="chevL" /> Back to cookbook
      </button>

      <div className="meal-plan-header">
        <div>
          <div className="eyebrow">Tonight's plan</div>
          <h1>{recipes.map(r => r.title).join(" + ")}</h1>
          <div className="summary">
            {recipes.length} {recipes.length === 1 ? "dish" : "dishes"} · about {fmtDuration(totalTime)} of cooking · staggered so everything lands at {fmtTime(finishTime)}.
          </div>
        </div>
        <div className="rhs">
          <div className="clock-big">{fmtTime(finishTime)}</div>
          <div className="clock-small">All ready by</div>
          <div style={{ marginTop: 16, display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="btn sm" onClick={() => onShop(recipes.map(r => ({ recipe: r, ings: r.ingredients })))}>
              <Icon name="bowl" size={12} /> Shopping list
            </button>
            <button className="btn ghost sm"><Icon name="print" size={12} /> Print</button>
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
          <Icon name="list" size={13} /> Combined timeline
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
        <CombinedTimeline grouped={grouped} />
      )}
      {tab !== "combined" && (
        <PerRecipeView
          rec={perRecipe.find(p => p.recipe.id === tab)}
          onCookMode={onCookMode}
        />
      )}
    </div>
  );
}

function CombinedTimeline({ grouped }) {
  return (
    <div className="combined-timeline">
      {grouped.map((g, gi) => (
        <React.Fragment key={gi}>
          <div className="timeline-marker">
            <Icon name="clock" size={13} /> {g.key}
          </div>
          {g.items.map((it, ii) => (
            <div className="timeline-row" data-rc={it.ri} key={`${gi}-${ii}`}>
              <div className="when-col">
                {fmtTime(it.start)}
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
          ))}
        </React.Fragment>
      ))}
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

Object.assign(window, { PlanMealModal, MealPlanPage });
