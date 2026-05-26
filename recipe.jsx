// Recipe detail — 3 variants share the same state & sub-components.
// Variants: editorial (default), magazine, binder.

const { useState, useEffect, useMemo } = React;

// ─────────────────────────────────────────────────────────────
// Shared: AI Adjust box
// ─────────────────────────────────────────────────────────────
// Each "chip" is a one-tap pre-filled prompt that triggers a real
// in-app adjustment. Free-text prompts are routed by a tiny
// heuristic parser for the demo; real impl would call Claude.

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

function AIAdjustBox({ recipe, scaler, applied, setApplied }) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);

  const chips = makeChips(recipe, scaler.servings, scaler.weight);

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

  const triggerFree = () => {
    if (!text.trim()) return;
    setRunning(true);
    setTimeout(() => {
      // Tiny heuristic parser for the demo
      const lower = text.toLowerCase();
      let summary = "AI couldn't auto-apply that one — review the original recipe and adjust manually.";
      const lbMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:lb|pound)/);
      const servMatch = lower.match(/(\d+)\s*serving/);
      if (lbMatch && recipe.scaleBy === "weight") {
        const w = parseFloat(lbMatch[1]);
        scaler.setWeight(w);
        summary = `Scaled to ${w} lb — cook time now ${Math.round(w * recipe.cookMinsPerLb)} min at 500°F`;
      } else if (servMatch && recipe.scaleBy !== "weight") {
        const n = parseInt(servMatch[1]);
        scaler.setServings(n);
        summary = `Scaled to ${n} servings — ingredients adjusted proportionally`;
      } else if (lower.includes("gluten")) {
        summary = "Suggested swaps: GF flour blend (1:1), gluten-free pasta. Sauce and seasoning are already GF.";
      } else if (lower.includes("dairy")) {
        summary = "Use vegan butter and a dairy-free cheese (Violife or Kite Hill).";
      } else if (lower.match(/half|halve/)) {
        if (recipe.scaleBy === "weight") scaler.setWeight(scaler.weight / 2);
        else scaler.setServings(Math.round(scaler.servings / 2));
        summary = "Halved everything.";
      } else if (lower.match(/double/)) {
        if (recipe.scaleBy === "weight") scaler.setWeight(scaler.weight * 2);
        else scaler.setServings(scaler.servings * 2);
        summary = "Doubled the recipe.";
      }
      setApplied([{ summary, prompt: text }, ...applied]);
      setRunning(false);
      setText("");
    }, 800);
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
        />
        <div className="actions">
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {running ? "Adjusting…" : "⌘⏎ to apply"}
          </span>
          <button className="btn primary sm" onClick={triggerFree} disabled={!text.trim() || running}>
            <Icon name="sparkle" size={11} /> Apply
          </button>
        </div>
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
function TagRow({ recipe, scaled }) {
  return (
    <div className="tag-row">
      <span className="recipe-tag diff">
        <span className="dot" /> {recipe.difficulty}
      </span>
      <span className="recipe-tag time">
        <Icon name="clock" size={11} /> {fmtDuration(scaled.totalTime)}
      </span>
      <span className="recipe-tag">
        <span className="dot" style={{ background: "var(--accent-cool)" }} /> {recipe.course}
      </span>
      <span className="recipe-tag">
        <span className="dot" style={{ background: "var(--ink-3)" }} /> {recipe.cuisine}
      </span>
      <span className="recipe-tag">
        <span className="dot" style={{ background: "var(--accent-warm)" }} /> {recipe.occasion}
      </span>
      {recipe.diet.slice(0, 3).map(d => (
        <span key={d} className="recipe-tag diet"><span className="dot" /> {d}</span>
      ))}
      <span className="recipe-tag author">by {recipe.author}</span>
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
          <div className="label">Prep</div>
          <div className="val">{recipe.prep}<span className="unit"> min</span></div>
        </div>
        <div className="cell">
          <div className="label">Cook</div>
          <div className="val">{scaled.cookMins}<span className="unit"> min</span></div>
        </div>
        <div className="cell">
          <div className="label">Total</div>
          <div className="val">{fmtDuration(scaled.totalTime)}</div>
        </div>
        <div className="cell servings-cell">
          <div className="label">Servings</div>
          <div className="servings-control">
            <button onClick={() => bumpServings(-1)} aria-label="Fewer servings" disabled={currentServings <= 1}>
              <Icon name="minus" size={11} />
            </button>
            <span className="val servings-val">
              {currentServings}
              {isWeight && <span className="weight-sub">{scaler.weight} lb roast</span>}
            </span>
            <button onClick={() => bumpServings(1)} aria-label="More servings">
              <Icon name="plus" size={11} />
            </button>
          </div>
        </div>
      </div>
      {showNutrition && (
        <div className="row nutrition">
          <div className="cell"><div className="val">{finalNutrition.cal}</div><div className="label">Calories</div></div>
          <div className="cell"><div className="val">{finalNutrition.protein}g</div><div className="label">Protein</div></div>
          <div className="cell"><div className="val">{finalNutrition.carbs}g</div><div className="label">Carbs</div></div>
          <div className="cell"><div className="val">{finalNutrition.fat}g</div><div className="label">Fat</div></div>
          <div className="cell"><div className="val">{finalNutrition.fiber}g</div><div className="label">Fiber</div></div>
          <div className="cell"><div className="val">{finalNutrition.sodium}mg</div><div className="label">Sodium</div></div>
        </div>
      )}
      <div style={{ padding: "8px 14px", borderTop: "1px solid var(--rule)", textAlign: "center", background: "var(--paper-2)" }}>
        <button className="btn ghost sm" onClick={() => setShowNutrition(!showNutrition)} style={{ fontSize: 11 }}>
          <Icon name={showNutrition ? "chevD" : "chevR"} size={11} />
          {showNutrition ? "Hide nutrition" : "Show nutrition per serving"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Ingredients card (with grouping)
// ─────────────────────────────────────────────────────────────
function IngredientsCard({ recipe, finalIngs, scaler, onShop, children }) {
  const grouped = useMemo(() => {
    const g = {};
    for (const i of finalIngs) {
      const k = i.grp || "Ingredients";
      // Hide the "Serve" group — those become Pairing suggestions instead
      if (k === "Serve") continue;
      (g[k] = g[k] || []).push(i);
    }
    return g;
  }, [finalIngs]);

  const yieldLabel = recipe.scaleBy === "weight"
    ? `${scaler.weight} ${recipe.weightUnit || "lb"} · ~${Math.round(scaler.weight / (recipe.lbPerServing || 0.7))} servings`
    : `${scaler.servings} servings`;

  return (
    <div className="ingredients-card">
      <h3>
        Ingredients
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: ".06em", textTransform: "uppercase" }}>
          {yieldLabel}
        </span>
      </h3>
      <div className="helper">{finalIngs.length} items, grouped by section</div>

      {Object.entries(grouped).map(([g, items]) => (
        <div key={g}>
          <div className="group-label">{g}</div>
          <ul>
            {items.map((i, idx) => (
              <li key={idx}>
                <span className="qty">{formatQty(i.qty)} {i.unit}</span>
                <span className="item">{i.item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <button className="btn" style={{ width: "100%", marginTop: 20 }} onClick={onShop}>
        <Icon name="bowl" /> Add to shopping list
      </button>

      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Timing bar (done-by)
// ─────────────────────────────────────────────────────────────
function TimingBar({ doneBy, setDoneBy, finishTime, setFinishTime, schedule }) {
  return (
    <div className={`timing-bar ${doneBy ? "active" : ""}`}>
      <Icon name="clock" />
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
        <input type="checkbox" checked={doneBy} onChange={(e) => setDoneBy(e.target.checked)} />
        <span>I want this done by</span>
      </label>
      <TimeOfDayInput value={finishTime} onChange={setFinishTime} />
      {doneBy && schedule && (
        <span className="start-pill">Start at {fmtTime(schedule.startTime)}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Steps list
// ─────────────────────────────────────────────────────────────
function StepsList({ steps, doneBy, schedule }) {
  return (
    <div className="steps-list">
      {steps.map((s, i) => (
        <div className="step" key={i}>
          <div className="n">{String(i + 1).padStart(2, "0")}</div>
          <div>
            <div className="t">{s.t}</div>
            <div className="d">{s.d}</div>
            <div className="meta">
              <span className={`precision-${s.precision}`}>● {s.precision}</span>
              <span className="time">{fmtDuration(s.mins)}</span>
              {s.hands != null && <span>hands-on {fmtDuration(s.hands)}</span>}
              {doneBy && schedule && (
                <span className="start">▶ {fmtTime(schedule.schedule[i].start)} – {fmtTime(schedule.schedule[i].end)}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Family-says synthesis (mocked per recipe)
// ─────────────────────────────────────────────────────────────
function familySaysFor(recipe) {
  const map = {
    "prime-rib":     "Family cooks consistently pull at 125°F for true medium-rare and rest 20 minutes (not 15). For 8+ lb roasts, Mom adds 12 minutes of high heat at the start. Pete recommends buying the whole rib bone-on and tying it yourself — same result, ~$40 cheaper.",
    "linguine-vongole": "Most cooks open a second bottle of wine the moment the first hits the pan. Jules pairs with crusty sourdough for the sauce.",
    "blueberry-lemon-rolls": "Frozen-not-thawed blueberries is the consensus. The double glaze + crumble combo is the version everyone asks about.",
    "block-party-ribs":  "The rib broth is the family's secret pantry item — strain it and use it as the base for Ryszard's Creamy Tomato Soup. Leftover ribs on Trish's Covid Bread is the standard next-day move.",
    "kt-turkey":         "Time is a guide, temperature is the truth — pull at 165°F in the thickest part of the thigh. Most family cooks reduce the meat in the stuffing so it cooks through inside the bird.",
    "ewas-pierogies":    "Potato & cheese is the default everyone agrees on; cabbage is a love-it-or-leave-it second. Topping ritual: butter, caramelized onions, crisp bacon, sour cream.",
  };
  return map[recipe.id] || null;
}

// ─────────────────────────────────────────────────────────────
// Shared: Cook's notes (disclosure)
// ─────────────────────────────────────────────────────────────
function CooksNotes({ recipe, defaultOpen }) {
  const familySays = familySaysFor(recipe);
  return (
    <details className="disclosure first" open={defaultOpen}>
      <summary>
        <span className="chev">›</span>
        <h3>Cook's notes</h3>
        <span className="count">{recipe.tips.length} {recipe.tips.length === 1 ? "note" : "notes"} + AI summary</span>
      </summary>
      <div className="disclosure-body">
        {familySays && (
          <div className="family-says">
            <div className="icon"><Icon name="sparkle" size={14} /></div>
            <div className="body">
              <div className="label">AI summary · what the family does differently</div>
              <div className="text">{familySays}</div>
            </div>
          </div>
        )}
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {recipe.tips.map((t, i) => (
            <li key={i} style={{ fontFamily: "var(--serif)", fontSize: 16, lineHeight: 1.5, padding: "6px 0", color: "var(--ink-2)" }}>{t}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared: Comments (disclosure)
// ─────────────────────────────────────────────────────────────
function CommentsPanel({ recipe, comments, addComment, defaultOpen }) {
  const all = [...(recipe.comments || []), ...(comments || [])];
  const [cName, setCName] = useState("");
  const [cText, setCText] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!cName.trim() || !cText.trim()) return;
    addComment(recipe.id, {
      name: cName.trim(), text: cText.trim(),
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
    setCName(""); setCText("");
  };
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>
        <span className="chev">›</span>
        <h3>Notes in the margin</h3>
        <span className="count">{all.length} {all.length === 1 ? "note" : "notes"}</span>
      </summary>
      <div className="disclosure-body">
        {all.map((c, i) => (
          <div className="comment" key={i}>
            <div className="av">{c.name[0]}</div>
            <div>
              <div className="head"><span className="name">{c.name}</span><span className="date">{c.date}</span></div>
              <div className="text">{c.text}</div>
            </div>
          </div>
        ))}
        <form className="comment-form" onSubmit={submit} style={{ marginTop: 16 }}>
          <h4 style={{ marginBottom: 8 }}>Leave a note</h4>
          <input type="text" placeholder="Your name" value={cName} onChange={(e) => setCName(e.target.value)} required />
          <textarea placeholder="What did you change? What did the kids say? What would your grandma do?" value={cText} onChange={(e) => setCText(e.target.value)} required />
          <button className="btn primary" style={{ alignSelf: "flex-end" }}>Post note</button>
        </form>
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────
// Variant: EDITORIAL (default) — refined, more whitespace, white cards
// ─────────────────────────────────────────────────────────────
function RecipeEditorial({ recipe, scaler, scaled, finalIngs, finalNutrition,
                          applied, setApplied, showNutrition, setShowNutrition,
                          doneBy, setDoneBy, finishTime, setFinishTime, schedule,
                          onCookMode, onShop, comments, addComment,
                          allRecipes, onSaveRecipe, openRecipe }) {
  return (
    <>
      {/* HERO */}
      <div className="recipe-hero">
        <div className="photo" style={{ backgroundImage: `url(${recipe.photo})` }} />
        <div className="meta">
          <div className="eyebrow" style={{ color: "var(--accent)" }}>
            {recipe.course} · {recipe.cuisine}
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
              <Icon name="play" /> Start cooking
            </button>
            <button className="btn" onClick={() => onShop([{ recipe, ings: finalIngs }])}>
              <Icon name="bowl" /> Shopping list
            </button>
            <button className="btn ghost" onClick={() => window.print()}>
              <Icon name="print" /> Print
            </button>
            <button className="btn ghost" onClick={() => alert("PDF export — coming soon.")}>
              <Icon name="download" /> PDF
            </button>
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
            <AIAdjustBox recipe={recipe} scaler={scaler} applied={applied} setApplied={setApplied} />
          </IngredientsCard>
        </aside>

        <div>
          <TimingBar doneBy={doneBy} setDoneBy={setDoneBy} finishTime={finishTime} setFinishTime={setFinishTime} schedule={schedule} />
          <StepsList steps={scaled.steps} doneBy={doneBy} schedule={schedule} />
          <NeedHelp recipe={recipe} />
        </div>
      </div>

      <PairingsSection recipe={recipe} allRecipes={allRecipes} openRecipe={openRecipe} onSaveRecipe={onSaveRecipe} />
      <div className="section-break">
        <span className="label">From the family</span>
      </div>
      <div>
        <CooksNotes recipe={recipe} defaultOpen={true} />
        <CommentsPanel recipe={recipe} comments={comments} addComment={addComment} defaultOpen={false} />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Variant: MAGAZINE — full-bleed hero, two-col below
// ─────────────────────────────────────────────────────────────
function RecipeMagazine({ recipe, scaler, scaled, finalIngs, finalNutrition,
                         applied, setApplied, showNutrition, setShowNutrition,
                         doneBy, setDoneBy, finishTime, setFinishTime, schedule,
                         onCookMode, onShop, comments, addComment,
                         allRecipes, onSaveRecipe, openRecipe }) {
  return (
    <>
      {/* Full-bleed hero */}
      <div className="recipe-magazine-hero" style={{ backgroundImage: `url(${recipe.photo})` }}>
        <div className="meta">
          <div>
            <div className="eyebrow">{recipe.course.toUpperCase()} · {recipe.cuisine.toUpperCase()}</div>
            <h1>{recipe.title}</h1>
            <div className="sub">{recipe.subtitle}</div>
            <SourceLink recipe={recipe} />
            <div className="author-block">
              <div className="av">{recipe.author[0]}</div>
              <div>A recipe from <strong style={{ fontWeight: 500 }}>{recipe.author}</strong></div>
            </div>
          </div>
          <div className="rhs">
            <div style={{ fontSize: 28, fontFamily: "var(--serif)", fontStyle: "italic", marginBottom: 6 }}>{fmtDuration(scaled.totalTime)}</div>
            <div>{recipe.difficulty.toUpperCase()} · {scaler.servings || `${scaler.weight} LB`}</div>
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
          <Icon name="play" /> Start cooking
        </button>
        <button className="btn" onClick={() => onShop([{ recipe, ings: finalIngs }])}>
          <Icon name="bowl" /> Shopping list
        </button>
        <button className="btn ghost" onClick={() => window.print()}>
          <Icon name="print" /> Print
        </button>
      </div>

      <div className="section-break">
        <span className="label">The method</span>
      </div>

      <div className="recipe-body">
        <aside className="ingredients-panel">
          <IngredientsCard recipe={recipe} finalIngs={finalIngs} scaler={scaler} onShop={() => onShop([{ recipe, ings: finalIngs }])}>
            <AIAdjustBox recipe={recipe} scaler={scaler} applied={applied} setApplied={setApplied} />
          </IngredientsCard>
        </aside>

        <div>
          <TimingBar doneBy={doneBy} setDoneBy={setDoneBy} finishTime={finishTime} setFinishTime={setFinishTime} schedule={schedule} />
          <StepsList steps={scaled.steps} doneBy={doneBy} schedule={schedule} />
          <NeedHelp recipe={recipe} />
        </div>
      </div>

      <PairingsSection recipe={recipe} allRecipes={allRecipes} openRecipe={openRecipe} onSaveRecipe={onSaveRecipe} />
      <div className="section-break">
        <span className="label">From the family</span>
      </div>
      <CooksNotes recipe={recipe} defaultOpen={true} />
      <CommentsPanel recipe={recipe} comments={comments} addComment={addComment} defaultOpen={false} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Variant: BINDER — recipe-card / scrapbook aesthetic
// ─────────────────────────────────────────────────────────────
function RecipeBinder({ recipe, scaler, scaled, finalIngs, finalNutrition,
                       applied, setApplied, showNutrition, setShowNutrition,
                       doneBy, setDoneBy, finishTime, setFinishTime, schedule,
                       onCookMode, onShop, comments, addComment,
                       allRecipes, onSaveRecipe, openRecipe }) {
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
        <span><strong>{recipe.course}</strong></span>
        <span>·</span>
        <span><strong>{recipe.cuisine}</strong></span>
        <span>·</span>
        <span>Prep <strong>{recipe.prep}min</strong></span>
        <span>Cook <strong>{scaled.cookMins}min</strong></span>
        <span>Total <strong>{fmtDuration(scaled.totalTime)}</strong></span>
        <span>·</span>
        <span><strong>{recipe.difficulty}</strong></span>
        <span>·</span>
        <span><strong>{scaler.servings || `${scaler.weight} lb`}</strong> serving{(scaler.servings || 1) > 1 ? "s" : ""}</span>
      </div>

      <TagRow recipe={recipe} scaled={scaled} />

      <StatsStrip
        recipe={recipe} scaler={scaler} scaled={scaled}
        finalNutrition={finalNutrition}
        showNutrition={showNutrition} setShowNutrition={setShowNutrition}
      />

      <div className="recipe-actions">
        <button className="btn primary" onClick={() => onCookMode(recipe, scaled.steps, finalIngs)}>
          <Icon name="play" /> Start cooking
        </button>
        <button className="btn" onClick={() => onShop([{ recipe, ings: finalIngs }])}>
          <Icon name="bowl" /> Shopping list
        </button>
        <button className="btn ghost" onClick={() => window.print()}>
          <Icon name="print" /> Print
        </button>
      </div>

      <div className="binder-body">
        <aside>
          <IngredientsCard recipe={recipe} finalIngs={finalIngs} scaler={scaler} onShop={() => onShop([{ recipe, ings: finalIngs }])}>
            <AIAdjustBox recipe={recipe} scaler={scaler} applied={applied} setApplied={setApplied} />
          </IngredientsCard>
        </aside>
        <div>
          <h3 style={{ marginBottom: 14, fontStyle: "italic" }}>How to make it</h3>
          <TimingBar doneBy={doneBy} setDoneBy={setDoneBy} finishTime={finishTime} setFinishTime={setFinishTime} schedule={schedule} />
          <StepsList steps={scaled.steps} doneBy={doneBy} schedule={schedule} />
          <NeedHelp recipe={recipe} />
        </div>
      </div>

      <div className="section-break">
        <span className="label">Margin notes</span>
      </div>
      <CooksNotes recipe={recipe} defaultOpen={true} />
      <CommentsPanel recipe={recipe} comments={comments} addComment={addComment} defaultOpen={false} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Top-level Recipe detail — holds all state, picks the variant
// ─────────────────────────────────────────────────────────────
function RecipeDetail({ recipe, variant, allRecipes, onBack, onCookMode, onShop, comments, addComment, onSaveRecipe, onOpenRecipe, onSaveToLab }) {
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

  // Calorie adjustment factor on top
  const calFactor = calTarget / recipe.nutrition.cal;
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
  const schedule = useMemo(() =>
    doneBy ? scheduleForFinish(scaled.steps, finishTime) : null,
  [doneBy, scaled.steps, finishTime]);

  const scaler = { servings, setServings, weight, setWeight, calTarget, setCalTarget };

  const variantProps = {
    recipe, scaler, scaled, finalIngs, finalNutrition,
    applied, setApplied, showNutrition, setShowNutrition,
    doneBy, setDoneBy, finishTime, setFinishTime, schedule,
    onCookMode, onShop, comments, addComment,
    allRecipes, onSaveRecipe, onSaveToLab,
    openRecipe: onOpenRecipe || ((r) => {}),
  };

  return (
    <div className="app" data-screen-label={`02 Recipe: ${recipe.title}`}>
      <button className="btn ghost" onClick={onBack} style={{ marginBottom: 24 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      {variant === "magazine" && <RecipeMagazine {...variantProps} />}
      {variant === "binder" && <RecipeBinder {...variantProps} />}
      {(!variant || variant === "editorial") && <RecipeEditorial {...variantProps} />}
    </div>
  );
}

Object.assign(window, { RecipeDetail });
