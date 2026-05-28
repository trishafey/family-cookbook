// Add Recipe — AI paste / manual / photo / URL flows
// AI extraction is mocked: paste text, hit "extract", a stub parses into fields.

import { useState, useEffect, useMemo, useRef } from "react";
import { Icon, signInUrl } from "./helpers.jsx";
import { FLAGS } from "./config/flags.js";
import { COURSES, OCCASIONS, DIETS } from "./data.js";
import { COUNTRIES } from "./countries.js";

function CuisineSearch({ value, onChange, usedCuisines = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c => c.toLowerCase().includes(q));
  }, [query]);

  const pick = (c) => { onChange(c); setOpen(false); setQuery(""); };

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <input
        style={{ width: "100%" }}
        value={open ? query : (value || "")}
        placeholder="Cuisine (e.g. Italian)"
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); }}
      />
      {open && (
        <div className="cuisine-pop">
          {usedCuisines.length > 0 && (
            <div className="cuisine-pills">
              {usedCuisines.map(c => (
                <button key={c} type="button" className="filter-pill" onClick={() => pick(c)}>{c}</button>
              ))}
            </div>
          )}
          <div className="cuisine-list">
            {matches.slice(0, 60).map(c => (
              <button key={c} type="button" className="cuisine-item" onClick={() => pick(c)}>{c}</button>
            ))}
            {matches.length === 0 && (
              <div style={{ padding: 10, color: "var(--ink-3)", fontSize: 13 }}>
                No matches — your typed text will be used as-is.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Group an ordered array of items by their section key, preserving the
// order each section first appears. Returns an array of { name, items }
// where items keep their original index for in-place edits.
function groupBySection(arr, keyOf, defaultName) {
  const seen = [];
  const byName = {};
  arr.forEach((it, idx) => {
    const name = keyOf(it) || defaultName;
    if (!byName[name]) {
      byName[name] = { name, items: [] };
      seen.push(byName[name]);
    }
    byName[name].items.push({ ...it, _idx: idx });
  });
  return seen;
}

function IngredientsEditor({ ingredients, onChange }) {
  const sections = groupBySection(ingredients, (i) => i.grp, "Ingredients");

  const update = (idx, patch) => {
    const next = [...ingredients];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx) => onChange(ingredients.filter((_, j) => j !== idx));
  const renameSection = (oldName, newName) => {
    onChange(ingredients.map(i => (i.grp || "Ingredients") === oldName ? { ...i, grp: newName } : i));
  };
  const deleteSection = (name) => {
    if (!confirm(`Delete the "${name}" section and its ingredients?`)) return;
    onChange(ingredients.filter(i => (i.grp || "Ingredients") !== name));
  };
  const addIngredientTo = (sectionName) =>
    onChange([...ingredients, { qty: 1, unit: "", item: "", grp: sectionName }]);
  const addSection = () => {
    const name = "New section";
    onChange([...ingredients, { qty: 1, unit: "", item: "", grp: name }]);
  };

  return (
    <div>
      {sections.map((sec) => (
        <div key={sec.name} className="form-section" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <input
              type="text"
              value={sec.name}
              onChange={(e) => renameSection(sec.name, e.target.value || "Ingredients")}
              style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1, border: "none", background: "transparent", padding: "2px 0" }}
              aria-label="Section name"
            />
            {sections.length > 1 && (
              <button type="button" className="btn ghost icon-only" onClick={() => deleteSection(sec.name)} title="Delete section">
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
          {sec.items.map((i) => (
            <div key={i._idx} style={{ display: "grid", gridTemplateColumns: "70px 80px 1fr 24px", gap: 6, marginBottom: 6 }}>
              <input type="number" step="0.25" value={i.qty} placeholder="Qty"
                onChange={(e) => update(i._idx, { qty: +e.target.value })} />
              <input value={i.unit} placeholder="Unit"
                onChange={(e) => update(i._idx, { unit: e.target.value })} />
              <input value={i.item} placeholder="e.g. ground beef"
                onChange={(e) => update(i._idx, { item: e.target.value })} />
              <button type="button" className="btn ghost icon-only" onClick={() => remove(i._idx)}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          <button type="button" className="btn ghost sm" onClick={() => addIngredientTo(sec.name)}>
            <Icon name="plus" size={12} /> Add ingredient
          </button>
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={addSection}>
        <Icon name="plus" size={12} /> Add section
      </button>
    </div>
  );
}

// hh:mm input pair backed by a single total-minutes number.
function HoursMinutes({ value, onChange }) {
  const total = +value || 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const set = (hrs, mins) => onChange(Math.max(0, (+hrs || 0) * 60 + (+mins || 0)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <input
        type="number" min="0" placeholder="hrs"
        value={h || ""}
        onChange={(e) => set(e.target.value, m)}
        style={{ width: 56 }}
      />
      <span style={{ color: "var(--ink-4)" }}>:</span>
      <input
        type="number" min="0" max="59" placeholder="mins"
        value={m || ""}
        onChange={(e) => set(h, e.target.value)}
        style={{ width: 64 }}
      />
    </div>
  );
}

function StepsEditor({ steps, onChange }) {
  const sections = groupBySection(steps, (s) => s.section, "");

  const update = (idx, patch) => {
    const next = [...steps];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx) => onChange(steps.filter((_, j) => j !== idx));
  const renameSection = (oldName, newName) => {
    onChange(steps.map(s => (s.section || "") === oldName ? { ...s, section: newName || null } : s));
  };
  const deleteSection = (name) => {
    if (!confirm(`Delete the "${name}" section and its steps?`)) return;
    onChange(steps.filter(s => (s.section || "") !== name));
  };
  const addStepTo = (sectionName) =>
    onChange([...steps, { t: "", d: "", mins: 0, precision: "easy", section: sectionName || null }]);
  const addSection = () => {
    const name = "New section";
    onChange([...steps, { t: "", d: "", mins: 0, precision: "easy", section: name }]);
  };

  return (
    <div>
      {sections.map((sec) => (
        <div key={sec.name || "__no_section"} className="form-section" style={{ marginBottom: 14 }}>
          {sec.name && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <input
                type="text"
                value={sec.name}
                onChange={(e) => renameSection(sec.name, e.target.value)}
                style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1, border: "none", background: "transparent", padding: "2px 0" }}
                aria-label="Section name"
              />
              <button type="button" className="btn ghost icon-only" onClick={() => deleteSection(sec.name)} title="Delete section">
                <Icon name="x" size={12} />
              </button>
            </div>
          )}
          {sec.items.map((s) => (
            <div key={s._idx} style={{ display: "grid", gridTemplateColumns: "1fr 150px 120px 24px", gap: 6, marginBottom: 6, alignItems: "start" }}>
              <textarea
                value={s.d}
                placeholder="What happens in this step"
                style={{ minHeight: 60 }}
                onChange={(e) => update(s._idx, { d: e.target.value, t: e.target.value.split(/[.:]/)[0].slice(0, 60) })}
              />
              <HoursMinutes value={s.mins} onChange={(v) => update(s._idx, { mins: v })} />
              <select value={s.precision || "easy"} onChange={(e) => update(s._idx, { precision: e.target.value })}>
                {["easy","medium","careful","watch","patient"].map(p => <option key={p}>{p}</option>)}
              </select>
              <button type="button" className="btn ghost icon-only" onClick={() => remove(s._idx)}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          <button type="button" className="btn ghost sm" onClick={() => addStepTo(sec.name)}>
            <Icon name="plus" size={12} /> Add step
          </button>
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={addSection}>
        <Icon name="plus" size={12} /> Add section
      </button>
    </div>
  );
}

export function AddRecipe({ onClose, onSave, onDelete, authEmail, initialRecipe = null, usedCuisines = [] }) {
  const editing = Boolean(initialRecipe);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  // Editing skips the AI/photo/URL flows — they only make sense for
  // bringing in a brand-new recipe. New entries default to manual
  // unless an AI flag opens up paste-text mode.
  const initialMode = editing ? "manual" : (FLAGS.extractText ? "ai" : "manual");
  const [mode, setMode] = useState(initialMode); // ai | manual | photo | url
  const [aiText, setAiText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [draft, setDraft] = useState(initialRecipe);

  // Manual form initial
  const newDraft = () => ({
    id: `recipe-${Date.now()}`,
    title: "",
    subtitle: "",
    author: "",
    cuisine: "",
    course: "Dinner",
    diet: [],
    occasion: "Family style",
    photo: "https://images.unsplash.com/photo-1547573854-74d2a71d0826?w=1200&q=80",
    photoTone: "#8a6a3a",
    favorite: false,
    rating: 0,
    cookCount: 0,
    servingsDefault: 4,
    prep: 0, cook: 0, total: 0,
    difficulty: "Easy",
    nutrition: { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 },
    ingredients: [{ qty: 1, unit: "", item: "", grp: "Ingredients" }],
    steps: [{ t: "", d: "", mins: 0, precision: "easy" }],
    tips: [],
    comments: [],
  });

  useEffect(() => {
    if (!draft) setDraft(newDraft());
    else if (editing) {
      // Backfill any optional fields the form expects but old recipes
      // might be missing, so we never bind <input>s to undefined.
      const empty = newDraft();
      setDraft(d => ({
        ...empty,
        ...d,
        nutrition: { ...empty.nutrition, ...(d.nutrition || {}) },
        tips: d.tips || [],
      }));
    }
  }, []);

  // ─── Fake AI extraction: take rough text, sketch a draft ───
  const runAI = async () => {
    if (!aiText.trim()) return;
    setExtracting(true);
    await new Promise(r => setTimeout(r, 900)); // simulate

    // Heuristic-only extractor for demo. Real impl would call Claude.
    const lines = aiText.split("\n").map(l => l.trim()).filter(Boolean);
    const titleGuess = lines[0]?.slice(0, 80) || "Untitled Family Recipe";
    const looksLikeIng = (l) => /^(\d|½|¼|¾|⅓|⅔|⅛|one|two|three|a |an )/i.test(l) || /\b(cup|tbsp|tsp|oz|lb|gram|kg|clove)/i.test(l);
    const looksLikeStep = (l) => /(heat|bake|cook|simmer|add|stir|mix|combine|preheat|whisk|fold|roll|fry|sauté|toast|serve|garnish|slice)/i.test(l) && l.length > 18;

    const ings = [];
    const steps = [];
    for (const l of lines.slice(1)) {
      if (looksLikeIng(l)) {
        // Parse "2 cups flour"
        const m = l.match(/^([\d.\/¼½¾⅓⅔⅛]+)\s*([a-z]+)?\s+(.*)/i);
        if (m) {
          ings.push({ qty: parseFloat(m[1]) || 1, unit: m[2] || "", item: m[3], grp: "Ingredients" });
        } else {
          ings.push({ qty: 1, unit: "", item: l, grp: "Ingredients" });
        }
      } else if (looksLikeStep(l)) {
        steps.push({ t: l.split(/[.:]/)[0].slice(0, 60), d: l, mins: 5, precision: "easy" });
      }
    }
    setDraft({
      ...newDraft(),
      title: titleGuess,
      subtitle: "Pasted from text — please review the details.",
      author: "You",
      ingredients: ings.length ? ings : newDraft().ingredients,
      steps: steps.length ? steps : newDraft().steps,
      total: steps.length * 8,
      prep: 10,
      cook: steps.length * 8,
    });
    setExtracting(false);
    setMode("manual"); // move into review-and-edit
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || `Upload failed (${res.status})`);
      }
      const { url } = await res.json();
      setDraft(d => ({ ...d, photo: url }));
    } catch (err) {
      setPhotoError(err.message || "Upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const save = async () => {
    if (!draft.title.trim()) { alert("Give it a title first."); return; }
    const out = { ...draft, total: draft.total || (draft.prep + draft.cook) };
    if (!out.link?.url) delete out.link;
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(out);
      onClose();
    } catch (err) {
      setSaveError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app" data-screen-label="04 Add Recipe">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back
      </button>

      {!authEmail && (
        <div style={{ padding: 12, marginBottom: 16, border: "1px solid var(--rule)", borderRadius: 6, background: "var(--paper-2)", fontFamily: "var(--serif)" }}>
          <strong>Sign in to save recipes to the cookbook.</strong>{" "}
          <a href={signInUrl()} style={{ color: "var(--accent)", textDecoration: "underline" }}>Sign in →</a>{" "}
          <span style={{ color: "var(--ink-3)" }}>You can fill in the form first; sign-in returns you here.</span>
        </div>
      )}
      {saveError && (
        <div style={{ padding: 10, marginBottom: 16, border: "1px solid #c44", borderRadius: 6, background: "rgba(196,68,68,0.08)", color: "#933" }}>
          {saveError}
        </div>
      )}

      <div className="section-head">
        <div className="lhs">
          <div className="eyebrow">{editing ? "Editing" : "New entry"}</div>
          <h2>{editing ? draft?.title || "Edit recipe" : "Add a recipe to the cookbook"}</h2>
        </div>
        <div className="rhs">
          {editing && onDelete && (
            <button
              className="btn ghost"
              onClick={() => onDelete(initialRecipe)}
              disabled={saving}
              style={{ color: "#C42807", marginRight: 4 }}
              title="Delete this recipe"
            >
              <Icon name="x" /> Delete
            </button>
          )}
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving || !authEmail}>
            {saving ? "Saving…" : (editing ? "Save changes" : "Save recipe")}
          </button>
        </div>
      </div>

      {!editing && (
      <div className="add-tabs">
        {FLAGS.extractText && (
        <button className={mode === "ai" ? "on" : ""} onClick={() => setMode("ai")}>
          <Icon name="sparkle" size={12} /> Paste & let AI fill it in
        </button>
        )}
        <button className={mode === "manual" ? "on" : ""} onClick={() => setMode("manual")}>
          <Icon name="edit" size={12} /> Manual entry
        </button>
        {FLAGS.extractImage && (
        <button className={mode === "photo" ? "on" : ""} onClick={() => setMode("photo")}>
          <Icon name="camera" size={12} /> Photo of a cookbook
        </button>
        )}
        {FLAGS.extractUrl && (
        <button className={mode === "url" ? "on" : ""} onClick={() => setMode("url")}>
          <Icon name="link" size={12} /> Link to a URL
        </button>
        )}
      </div>
      )}

      {mode === "ai" && (
        <div style={{ maxWidth: 760 }}>
          <div className="ai-drop">
            <div className="ai-sparkle" style={{ marginBottom: 12 }}>
              <Icon name="sparkle" size={12} /> AI extraction
            </div>
            <textarea
              placeholder="Paste anything — a recipe email from your mom, a copy/paste from a blog, a screenshot of a cookbook page. We'll pull out the title, ingredients, steps, and timing, then let you review and tidy up before saving."
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
              <button className="btn accent" disabled={!aiText.trim() || extracting} onClick={runAI}>
                {extracting ? "Extracting…" : <><Icon name="sparkle" size={13} /> Extract recipe</>}
              </button>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                You'll review every field before saving. AI fills in missing details — never replaces yours.
              </span>
            </div>
          </div>

          <div style={{ marginTop: 32, fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-3)" }}>
            Or try one of these:
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {[
              "Aunt Sandy's pavlova",
              "Grandpa's clam chowder",
              "30-minute weeknight tacos",
            ].map(s => (
              <button key={s} className="btn ghost sm" onClick={() => setAiText(`${s}\n\n2 cups flour\n3 eggs\n1 cup sugar\n\nPreheat oven to 350°F. Whisk eggs and sugar. Fold in flour. Bake 25 minutes until golden.`)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "manual" && draft && (
        <div style={{ maxWidth: 800 }}>
          <div className="input-row">
            <label>Title *</label>
            <div>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Grandma's Sunday Lasagna" />
            </div>
          </div>
          <div className="input-row">
            <label>One-line subtitle</label>
            <div>
              <input value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} placeholder="A tagline, the family lore" />
            </div>
          </div>
          <div className="input-row">
            <label>Added by</label>
            <div>
              <input value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} placeholder="Your name" />
            </div>
          </div>
          <div className="input-row">
            <label>Source link</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ flex: 2 }}
                value={draft.link?.url || ""}
                onChange={(e) => setDraft({ ...draft, link: { ...(draft.link || {}), url: e.target.value } })}
                placeholder="https://example.com/recipe (optional)"
              />
              <input
                style={{ flex: 1 }}
                value={draft.link?.label || ""}
                onChange={(e) => setDraft({ ...draft, link: { ...(draft.link || {}), label: e.target.value } })}
                placeholder="Link label"
              />
            </div>
          </div>
          <div className="input-row">
            <label>Course / Cuisine</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={draft.course} onChange={(e) => setDraft({ ...draft, course: e.target.value })} style={{ width: 140, flex: "0 0 auto" }}>
                {COURSES.map(c => <option key={c}>{c}</option>)}
              </select>
              <CuisineSearch value={draft.cuisine} onChange={(v) => setDraft({ ...draft, cuisine: v })} usedCuisines={usedCuisines} />
            </div>
          </div>
          <div className="input-row">
            <label>Occasion</label>
            <div>
              <select value={draft.occasion} onChange={(e) => setDraft({ ...draft, occasion: e.target.value })}>
                {OCCASIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="input-row">
            <label>Diet / preferences</label>
            <div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {DIETS.map(d => (
                  <button
                    key={d}
                    className={`filter-pill ${draft.diet.includes(d) ? "on" : ""}`}
                    onClick={() => setDraft(p => ({ ...p, diet: p.diet.includes(d) ? p.diet.filter(x => x !== d) : [...p.diet, d] }))}
                  >{d}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="input-row">
            <label>Prep / Cook (min)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" value={draft.prep} onChange={(e) => setDraft({ ...draft, prep: +e.target.value })} placeholder="Prep" style={{ width: 120 }} />
              <input type="number" value={draft.cook} onChange={(e) => setDraft({ ...draft, cook: +e.target.value })} placeholder="Cook" style={{ width: 120 }} />
            </div>
          </div>

          <div className="input-row">
            <label>Overnight step?</label>
            <div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.steps.some(s => s.overnight)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      // Add a starter overnight step if one doesn't already exist.
                      if (!draft.steps.some(s => s.overnight)) {
                        setDraft({
                          ...draft,
                          steps: [...draft.steps, {
                            t: "Overnight rest",
                            d: "Park in the fridge / freezer / counter overnight.",
                            mins: 480,
                            precision: "patient",
                            overnight: true,
                            section: "Overnight",
                          }],
                        });
                      }
                    } else {
                      // Remove any overnight steps.
                      setDraft({ ...draft, steps: draft.steps.filter(s => !s.overnight) });
                    }
                  }}
                />
                <span style={{ fontFamily: "var(--serif)", color: "var(--ink-2)" }}>
                  Recipe has an overnight rest (fridge, proof, freeze, marinate)
                </span>
              </label>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                Adds an "Overnight" section to the steps below. The scheduler will plan that step for the night before instead of pre-dawn the day of.
              </div>
            </div>
          </div>
          <div className="input-row">
            <label>Servings (default)</label>
            <div>
              <input type="number" value={draft.servingsDefault} onChange={(e) => setDraft({ ...draft, servingsDefault: +e.target.value })} style={{ width: 100 }} />
            </div>
          </div>

          <div className="input-row">
            <label>Difficulty</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Easy", "Medium", "Hard"].map(d => (
                <button
                  key={d}
                  type="button"
                  className={`btn sm ${draft.difficulty === d ? "primary" : ""}`}
                  onClick={() => setDraft({ ...draft, difficulty: d })}
                >{d}</button>
              ))}
            </div>
          </div>

          <div className="input-row">
            <label>Nutrition (per serving)</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 6, maxWidth: 480 }}>
              {[
                ["cal", "Calories"],
                ["protein", "Protein (g)"],
                ["carbs", "Carbs (g)"],
                ["fat", "Fat (g)"],
                ["fiber", "Fiber (g)"],
                ["sodium", "Sodium (mg)"],
              ].map(([key, label]) => (
                <label key={key} style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {label}
                  <input
                    type="number"
                    value={draft.nutrition?.[key] ?? 0}
                    onChange={(e) => setDraft({
                      ...draft,
                      nutrition: { ...(draft.nutrition || {}), [key]: +e.target.value }
                    })}
                    style={{ width: "100%", marginTop: 2 }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="input-row" style={{ alignItems: "stretch" }}>
            <label>Cook's notes / tips</label>
            <div>
              {(draft.tips || []).map((t, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 24px", gap: 6, marginBottom: 6 }}>
                  <input
                    type="text"
                    value={t}
                    placeholder="e.g. Pull from the fridge 2 hours before cooking."
                    onChange={(e) => {
                      const tips = [...(draft.tips || [])];
                      tips[idx] = e.target.value;
                      setDraft({ ...draft, tips });
                    }}
                  />
                  <button type="button" className="btn ghost icon-only" onClick={() => {
                    setDraft({ ...draft, tips: (draft.tips || []).filter((_, i) => i !== idx) });
                  }}><Icon name="x" size={12} /></button>
                </div>
              ))}
              <button type="button" className="btn ghost sm" onClick={() => {
                setDraft({ ...draft, tips: [...(draft.tips || []), ""] });
              }}>
                <Icon name="plus" size={12} /> Add tip
              </button>
            </div>
          </div>

          <div className="input-row" style={{ alignItems: "stretch" }}>
            <label>Ingredients</label>
            <div>
              <IngredientsEditor
                ingredients={draft.ingredients}
                onChange={(ings) => setDraft({ ...draft, ingredients: ings })}
              />
              {FLAGS.extractText && (
              <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => alert("AI would fill in missing quantities, units, and pantry-staple defaults.")}>
                <Icon name="sparkle" size={12} /> AI fill missing details
              </button>
              )}
            </div>
          </div>

          <div className="input-row" style={{ alignItems: "stretch" }}>
            <label>Steps</label>
            <div>
              <StepsEditor
                steps={draft.steps}
                onChange={(steps) => setDraft({ ...draft, steps })}
              />
            </div>
          </div>

          <div className="input-row">
            <label>Hero photo</label>
            <div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 100, height: 80, backgroundImage: `url(${draft.photo})`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--rule)", borderRadius: 4 }} />
                <div style={{ flex: 1 }}>
                  <label className="btn sm" style={{ cursor: authEmail && !uploadingPhoto ? "pointer" : "not-allowed", opacity: authEmail && !uploadingPhoto ? 1 : 0.5 }}>
                    <Icon name="camera" size={12} /> {uploadingPhoto ? "Uploading…" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!authEmail || uploadingPhoto}
                      style={{ display: "none" }}
                      onChange={(e) => uploadPhoto(e.target.files?.[0])}
                    />
                  </label>
                  {FLAGS.extractImage && (
                  <button className="btn ghost sm" style={{ marginLeft: 6 }}><Icon name="sparkle" size={12} /> AI-generate from title</button>
                  )}
                  {photoError && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#933" }}>{photoError}</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 32, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={saving || !authEmail}>
              {saving ? "Saving…" : "Save to cookbook"}
            </button>
          </div>
        </div>
      )}

      {mode === "photo" && (
        <div style={{ maxWidth: 720 }}>
          <div className="ai-drop" style={{ textAlign: "center", padding: 64 }}>
            <Icon name="camera" size={48} />
            <h3 style={{ marginTop: 16 }}>Snap a photo of a cookbook page</h3>
            <div style={{ color: "var(--ink-3)", marginTop: 8, fontFamily: "var(--serif)" }}>
              We'll OCR the text, then parse the recipe like a normal paste. Mobile-friendly camera capture.
            </div>
            <div style={{ marginTop: 24, display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn primary"><Icon name="camera" size={13} /> Open camera</button>
              <button className="btn">Upload an image</button>
            </div>
            <div style={{ marginTop: 20, fontSize: 12, color: "var(--ink-3)" }}>
              <span className="ai-sparkle"><Icon name="sparkle" size={11} /> AI-parsed</span> · You'll review every field before saving.
            </div>
          </div>
        </div>
      )}

      {mode === "url" && (
        <div style={{ maxWidth: 720 }}>
          <div className="ai-drop">
            <div className="ai-sparkle" style={{ marginBottom: 12 }}>
              <Icon name="sparkle" size={12} /> AI-parse from URL
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ flex: 1, padding: 10, border: "1px solid var(--rule)", borderRadius: 4, background: "var(--paper)" }} placeholder="https://nytimes.com/cooking/recipes/..." />
              <button className="btn accent">Fetch & parse</button>
            </div>
            <div style={{ marginTop: 16, fontSize: 13, color: "var(--ink-3)" }}>
              We pull title, ingredients, steps, and a hero image. You annotate with family notes before saving.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

