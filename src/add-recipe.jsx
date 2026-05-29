// Add Recipe — AI paste / manual / photo / URL flows
// AI extraction is mocked: paste text, hit "extract", a stub parses into fields.

import { useState, useEffect, useMemo, useRef } from "react";
import { Icon, signInUrl } from "./helpers.jsx";
import { FLAGS } from "./config/flags.js";
import { COURSES, OCCASIONS, DIETS, ORIGINS } from "./data.js";
import { COUNTRIES } from "./countries.js";
import { useLang } from "./i18n.js";

function CuisineSearch({ value, onChange, usedCuisines = [] }) {
  const { t } = useLang();
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
        placeholder={t("cuisinePh")}
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
// Re-orders a steps array so all entries of one section sit contiguously,
// preserving the order each section first appears. Without this, an
// array like [A_day1, B_day2, C_day1] renders on the recipe page as
// "Day 1 / Day 2 / Day 1" — the edit form's visual grouping hides the
// problem in the editor, but the recipe page walks the array linearly.
function groupStepsBySection(steps) {
  const sectionOrder = [];
  const bySection = {};
  for (const s of steps) {
    const key = s.section || "";
    if (!bySection[key]) {
      bySection[key] = [];
      sectionOrder.push(key);
    }
    bySection[key].push(s);
  }
  return sectionOrder.flatMap(k => bySection[k]);
}

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
  const { t } = useLang();
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
      {sections.map((sec, sectionIdx) => (
        <div key={sectionIdx} className="form-section" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <input
              type="text"
              value={sec.name}
              onChange={(e) => renameSection(sec.name, e.target.value || "Ingredients")}
              className="section-name-input"
              aria-label={t("sectionName")}
            />
            {sections.length > 1 && (
              <button type="button" className="btn ghost icon-only" onClick={() => deleteSection(sec.name)} title={t("deleteSection")}>
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
          {sec.items.map((i) => (
            <div key={i._idx} style={{ display: "grid", gridTemplateColumns: "70px 80px 1fr 24px", gap: 6, marginBottom: 6 }}>
              <input type="number" step="0.25" value={i.qty || ""} placeholder={t("qtyPh")}
                onChange={(e) => update(i._idx, { qty: e.target.value === "" ? 0 : +e.target.value })} />
              <input value={i.unit} placeholder={t("unitPh")}
                onChange={(e) => update(i._idx, { unit: e.target.value })} />
              <input value={i.item} placeholder={t("ingredientPh")}
                onChange={(e) => update(i._idx, { item: e.target.value })} />
              <button type="button" className="btn ghost icon-only" onClick={() => remove(i._idx)}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          <button type="button" className="btn ghost sm" onClick={() => addIngredientTo(sec.name)}>
            <Icon name="plus" size={12} /> {t("addIngredient")}
          </button>
        </div>
      ))}
      <button type="button" className="btn add-section-btn" onClick={addSection}>
        <Icon name="plus" size={13} /> {t("addSection")}
      </button>
    </div>
  );
}

// hh:mm input pair backed by a single total-minutes number.
function HoursMinutes({ value, onChange }) {
  const { t } = useLang();
  const total = +value || 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const set = (hrs, mins) => onChange(Math.max(0, (+hrs || 0) * 60 + (+mins || 0)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <input
        type="number" min="0" placeholder={t("hrs")}
        value={h || ""}
        onChange={(e) => set(e.target.value, m)}
        style={{ width: 56 }}
      />
      <span style={{ color: "var(--ink-4)" }}>:</span>
      <input
        type="number" min="0" max="59" placeholder={t("mins")}
        value={m || ""}
        onChange={(e) => set(h, e.target.value)}
        style={{ width: 64 }}
      />
    </div>
  );
}

function StepsEditor({ steps, onChange }) {
  const { t } = useLang();
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
  const addStepTo = (sectionName) => {
    // Insert at the end of the matching section so the underlying array
    // order matches what the user sees in the editor. Otherwise the
    // recipe page (which renders steps linearly, not grouped) ends up
    // with interleaved section headers like
    // "Day before / Cooking day / Day before".
    const newStep = { t: "", d: "", mins: 0, precision: "easy", section: sectionName || null };
    const target = sectionName || "";
    let lastIdx = -1;
    steps.forEach((s, i) => { if ((s.section || "") === target) lastIdx = i; });
    if (lastIdx === -1) onChange([...steps, newStep]);
    else {
      const next = [...steps];
      next.splice(lastIdx + 1, 0, newStep);
      onChange(next);
    }
  };
  const addSection = () => {
    const name = "New section";
    onChange([...steps, { t: "", d: "", mins: 0, precision: "easy", section: name }]);
  };
  // Swap two adjacent rows. Native HTML5 drag-and-drop doesn't work on
  // iPad Safari (touch events don't fire dragstart), so explicit up/down
  // arrows are the reliable interaction.
  const moveStep = (idx, delta) => {
    const target = idx + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[idx], next[target]] = [next[target], next[idx]];
    // Stepping across a section boundary moves the row INTO the new
    // section so the visual sequence stays coherent.
    next[target] = { ...next[target], section: next[idx + delta]?.section ?? next[target].section };
    onChange(next);
  };

  return (
    <div>
      {sections.map((sec, sectionIdx) => (
        <div key={sectionIdx} className="form-section" style={{ marginBottom: 14 }}>
          {sec.name && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <input
                type="text"
                value={sec.name}
                onChange={(e) => renameSection(sec.name, e.target.value)}
                className="section-name-input"
                aria-label={t("sectionName")}
              />
              <button type="button" className="btn ghost icon-only" onClick={() => deleteSection(sec.name)} title={t("deleteSection")}>
                <Icon name="x" size={12} />
              </button>
            </div>
          )}
          {sec.items.map((s) => (
            <div key={s._idx} className="step-row">
              <div className="reorder-stack">
                <button type="button" onClick={() => moveStep(s._idx, -1)} disabled={s._idx === 0} aria-label={t("moveUp")} title={t("moveUp")}>
                  <Icon name="chevU" size={12} />
                </button>
                <button type="button" onClick={() => moveStep(s._idx, +1)} disabled={s._idx === steps.length - 1} aria-label={t("moveDown")} title={t("moveDown")}>
                  <Icon name="chevD" size={12} />
                </button>
              </div>
              <div className="step-fields">
                <textarea
                  value={s.d}
                  placeholder={t("stepPlaceholder")}
                  onChange={(e) => update(s._idx, { d: e.target.value, t: e.target.value.split(/[.:]/)[0].slice(0, 60) })}
                />
                <div className="step-meta">
                  <HoursMinutes value={s.mins} onChange={(v) => update(s._idx, { mins: v })} />
                  <select value={s.precision || "easy"} onChange={(e) => update(s._idx, { precision: e.target.value })}>
                    {["easy","medium","careful","watch","patient"].map(p => <option key={p}>{p}</option>)}
                  </select>
                  <button type="button" className="btn ghost icon-only step-remove" onClick={() => remove(s._idx)} aria-label={t("remove")}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="btn ghost sm" onClick={() => addStepTo(sec.name)}>
            <Icon name="plus" size={12} /> {t("addStep")}
          </button>
        </div>
      ))}
      <button type="button" className="btn add-section-btn" onClick={addSection}>
        <Icon name="plus" size={13} /> {t("addSection")}
      </button>
    </div>
  );
}

export function AddRecipe({ onClose, onSave, onDelete, authEmail, initialRecipe = null, usedCuisines = [], usedAuthors = [] }) {
  const { t, tCourse, tOccasion, tDiet, tDifficulty, tOrigin } = useLang();
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
  const [aiUrl, setAiUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  // Photo-mode queue. Each entry is { file, preview } where preview is
  // a blob: URL we revoke on removal / unmount so we don't leak.
  const [pendingImages, setPendingImages] = useState([]);
  // Drag-and-drop on desktop: tracks whether files are hovering over
  // the drop zone so we can highlight it.
  const [dragHover, setDragHover] = useState(false);
  const [draft, setDraft] = useState(initialRecipe);

  useEffect(() => () => {
    pendingImages.forEach(p => URL.revokeObjectURL(p.preview));
  }, []);

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
    origin: null,
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
    // Original snapshots when the recipe was extracted from photos.
    // We keep every page so the recipe page can offer a "view the
    // original" reveal — useful for handwritten cards from family.
    sourcePhotos: [],
    // When on, the recipe page shows a small reveal icon over the
    // hero photo. The cook flips this in the editor; defaults to true
    // immediately after an image extraction (the act of uploading
    // implies intent to show).
    showSourcePhotos: false,
  });

  useEffect(() => {
    if (!draft) setDraft(newDraft());
    else if (editing) {
      // Backfill any optional fields the form expects but old recipes
      // might be missing, so we never bind <input>s to undefined.
      // Also reorder steps so all members of a section sit together —
      // self-heals recipes saved before that invariant was enforced.
      const empty = newDraft();
      setDraft(d => ({
        ...empty,
        ...d,
        nutrition: { ...empty.nutrition, ...(d.nutrition || {}) },
        tips: d.tips || [],
        steps: groupStepsBySection(d.steps || []),
      }));
    }
  }, []);

  // Merge an extraction response (from /api/admin/ai/extract-text or
  // /api/admin/ai/extract-url) into a fresh draft, then drop the user
  // into the manual review view so they can tweak before saving.
  const applyExtraction = (parsed) => {
    const fresh = newDraft();
    const ings = (parsed.ingredients?.length ? parsed.ingredients : fresh.ingredients)
      .map(i => ({ ...i, grp: i.grp || "Ingredients" }));
    const steps = parsed.steps?.length ? parsed.steps : fresh.steps;
    setDraft({
      ...fresh,
      title:           parsed.title           || fresh.title,
      subtitle:        parsed.subtitle        || "",
      author:          parsed.author          || "",
      cuisine:         parsed.cuisine         || "",
      course:          parsed.course          || fresh.course,
      occasion:        parsed.occasion        || fresh.occasion,
      diet:            parsed.diet            || [],
      prep:            parsed.prep            ?? 0,
      cook:            parsed.cook            ?? 0,
      servingsDefault: parsed.servingsDefault || fresh.servingsDefault,
      difficulty:      parsed.difficulty      || fresh.difficulty,
      ingredients:     ings,
      steps,
      tips:            parsed.tips            || [],
      nutrition: {
        ...fresh.nutrition,
        ...(parsed.nutrition || {}),
      },
      total:           (parsed.prep || 0) + (parsed.cook || 0),
      // URL extraction tucks the source URL onto the response so it
      // populates the Source link field — saves the cook from copying
      // it manually. Image extraction tucks the R2 URLs onto
      // sourcePhotos (NOT .photo — the hero stays whatever the cook
      // picks via Upload Photo) and toggles the reveal on by default.
      link: parsed.sourceUrl ? { url: parsed.sourceUrl, label: "" } : fresh.link,
      sourcePhotos: parsed.sourcePhotos || fresh.sourcePhotos,
      showSourcePhotos: parsed.showSourcePhotos ?? fresh.showSourcePhotos,
    });
    setMode("manual");
  };

  // Real AI extraction from pasted text.
  const runAI = async () => {
    if (!aiText.trim()) return;
    setExtracting(true);
    try {
      const res = await fetch("/api/admin/ai/extract-text", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ text: aiText }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || `Extraction failed (${res.status})`);
      }
      applyExtraction(await res.json());
    } catch (err) {
      alert(err.message || "Could not extract this recipe. Try the manual form instead.");
    } finally {
      setExtracting(false);
    }
  };

  // Real AI extraction from a URL — Worker fetches and parses the page.
  const runFromUrl = async () => {
    if (!aiUrl.trim()) return;
    setExtracting(true);
    try {
      const res = await fetch("/api/admin/ai/extract-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ url: aiUrl.trim() }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || `Extraction failed (${res.status})`);
      }
      applyExtraction(await res.json());
    } catch (err) {
      alert(err.message || "Could not fetch that page. Try copy-paste mode instead.");
    } finally {
      setExtracting(false);
    }
  };

  // Photo-mode queue: cooks can append shots from camera or upload
  // multiple from camera roll, then send the whole batch to the
  // Worker. Useful when a recipe spans cookbook pages or a
  // recipe-card front+back.
  const MAX_QUEUED_IMAGES = 6;
  const enqueueImages = (fileList) => {
    if (!fileList || !fileList.length) return;
    const incoming = Array.from(fileList).filter(f => f.type.startsWith("image/"));
    setPendingImages(prev => {
      const room = MAX_QUEUED_IMAGES - prev.length;
      if (room <= 0) {
        alert(`Max ${MAX_QUEUED_IMAGES} photos per recipe — remove one to add more.`);
        return prev;
      }
      if (incoming.length > room) {
        alert(`Only added the first ${room}: max ${MAX_QUEUED_IMAGES} photos per recipe.`);
      }
      const added = incoming.slice(0, room).map(file => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      return [...prev, ...added];
    });
  };
  const removeQueued = (idx) => {
    setPendingImages(prev => {
      URL.revokeObjectURL(prev[idx]?.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // Sends every queued photo to the Worker in one shot — the vision
  // model stitches them into a single recipe and we park each
  // original in R2 so the family can reveal them later.
  const runFromImages = async () => {
    if (!pendingImages.length) return;
    setExtracting(true);
    try {
      const body = new FormData();
      for (const p of pendingImages) body.append("file", p.file);
      const res = await fetch("/api/admin/ai/extract-image", {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || `Extraction failed (${res.status})`);
      }
      const parsed = await res.json();
      pendingImages.forEach(p => URL.revokeObjectURL(p.preview));
      setPendingImages([]);
      applyExtraction(parsed);
    } catch (err) {
      alert(err.message || "Could not read those photos. Try clearer shots, or use the manual form.");
    } finally {
      setExtracting(false);
    }
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
    out.steps = groupStepsBySection(out.steps);
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
          <strong>{t("signInToSaveRecipes")}</strong>{" "}
          <a href={signInUrl()} style={{ color: "var(--accent)", textDecoration: "underline" }}>{t("signInArrow")}</a>{" "}
          <span style={{ color: "var(--ink-3)" }}>{t("fillFormFirst")}</span>
        </div>
      )}
      {saveError && (
        <div style={{ padding: 10, marginBottom: 16, border: "1px solid #c44", borderRadius: 6, background: "rgba(196,68,68,0.08)", color: "#933" }}>
          {saveError}
        </div>
      )}

      <div className="section-head">
        <div className="lhs">
          <div className="eyebrow">{editing ? t("editing") : t("newEntry")}</div>
          <h2>{editing ? draft?.title || t("editRecipeTitle") : t("addRecipeToCookbook")}</h2>
        </div>
        <div className="rhs">
          {editing && onDelete && (
            <button
              className="btn ghost"
              onClick={() => onDelete(initialRecipe)}
              disabled={saving}
              style={{ color: "#C42807", marginRight: 4 }}
              title={t("deleteThisRecipe")}
            >
              <Icon name="x" /> {t("delete")}
            </button>
          )}
          <button className="btn" onClick={onClose} disabled={saving}>{t("cancel")}</button>
          <button className="btn primary" onClick={save} disabled={saving || !authEmail}>
            {saving ? t("saving") : (editing ? t("saveChanges") : t("saveRecipe"))}
          </button>
        </div>
      </div>

      {/* When the visitor isn't signed in, the entire form below is wrapped
          in a disabled fieldset. <fieldset disabled> natively cascades the
          disabled state to every <input>, <select>, <textarea>, and
          <button> inside, so we don't have to thread the prop through
          dozens of child components. The CSS rule dims the whole block so
          it reads as locked. */}
      <fieldset className="add-recipe-fields" disabled={!authEmail}>
      {!editing && (
      <div className="add-tabs">
        {FLAGS.extractText && (
        <button className={mode === "ai" ? "on" : ""} onClick={() => setMode("ai")}>
          <Icon name="sparkle" size={12} /> {t("pasteAndAi")}
        </button>
        )}
        {FLAGS.extractImage && (
        <button className={mode === "photo" ? "on" : ""} onClick={() => setMode("photo")}>
          <Icon name="camera" size={12} /> {t("photoOfCookbook")}
        </button>
        )}
        <button className={mode === "manual" ? "on" : ""} onClick={() => setMode("manual")}>
          <Icon name="edit" size={12} /> {t("manualEntry")}
        </button>
        {FLAGS.extractUrl && (
        <button className={mode === "url" ? "on" : ""} onClick={() => setMode("url")}>
          <Icon name="link" size={12} /> {t("linkToUrl")}
        </button>
        )}
      </div>
      )}

      {mode === "ai" && (
        <div style={{ maxWidth: 760 }}>
          <div className="ai-drop">
            <div className="ai-sparkle" style={{ marginBottom: 12 }}>
              <Icon name="sparkle" size={12} /> {t("aiExtraction")}
            </div>
            <textarea
              placeholder={t("aiPastePlaceholder")}
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
              <button className="btn accent" disabled={!aiText.trim() || extracting} onClick={runAI}>
                {extracting ? t("extracting") : <><Icon name="sparkle" size={13} /> {t("extractRecipe")}</>}
              </button>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                {t("aiPasteHelper")}
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
          {/* IDENTITY: what this dish is + provenance */}
          <div className="input-row">
            <label>{t("titleRequired")}</label>
            <div>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t("titleEx")} />
            </div>
          </div>
          <div className="input-row">
            <label>{t("oneLineSubLbl")}</label>
            <div>
              <input value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} placeholder={t("subtitleEx")} />
            </div>
          </div>
          <div className="input-row">
            <label>{t("addedByLbl")}</label>
            <div>
              {/* Datalist gives a dropdown of past authors (most-recently
                  used first via the order they appear in usedAuthors) but
                  still lets the user type a brand-new name. */}
              <input
                list="past-authors"
                value={draft.author}
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                placeholder={t("yourName")}
              />
              <datalist id="past-authors">
                {usedAuthors.map(a => <option key={a} value={a} />)}
              </datalist>
            </div>
          </div>
          <div className="input-row">
            <label>{t("sourceLinkLbl")}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ flex: 2 }}
                value={draft.link?.url || ""}
                onChange={(e) => setDraft({ ...draft, link: { ...(draft.link || {}), url: e.target.value } })}
                placeholder={t("sourceLinkPh")}
              />
              <input
                style={{ flex: 1 }}
                value={draft.link?.label || ""}
                onChange={(e) => setDraft({ ...draft, link: { ...(draft.link || {}), label: e.target.value } })}
                placeholder={t("linkLabelPh")}
              />
            </div>
          </div>

          {/* CLASSIFICATION: how it fits in the cookbook */}
          <div className="input-row">
            <label>{t("courseSlashCuisine")}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={draft.course} onChange={(e) => setDraft({ ...draft, course: e.target.value })} style={{ width: 140, flex: "0 0 auto" }}>
                {COURSES.map(c => <option key={c} value={c}>{tCourse(c)}</option>)}
              </select>
              <CuisineSearch value={draft.cuisine} onChange={(v) => setDraft({ ...draft, cuisine: v })} usedCuisines={usedCuisines} />
            </div>
          </div>
          <div className="input-row">
            <label>{t("occasion")}</label>
            <div>
              <select value={draft.occasion} onChange={(e) => setDraft({ ...draft, occasion: e.target.value })}>
                {OCCASIONS.map(o => <option key={o} value={o}>{tOccasion(o)}</option>)}
              </select>
            </div>
          </div>
          {/* Origin: heirloom / new to the family / lab experiment.
              Optional — un-selecting clears the field so the badge
              doesn't render on the recipe page. */}
          <div className="input-row">
            <label>{t("originLbl")}</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                className={`btn sm ${!draft.origin ? "primary" : "ghost"}`}
                onClick={() => setDraft({ ...draft, origin: null })}
              >
                {t("noneLabel")}
              </button>
              {ORIGINS.map(o => (
                <button
                  key={o}
                  type="button"
                  className={`btn sm ${draft.origin === o ? "primary" : "ghost"}`}
                  onClick={() => setDraft({ ...draft, origin: o })}
                >
                  <Icon name={o === "heirloom" ? "tomato" : o === "newToFamily" ? "sprout" : "beaker"} size={12} /> {tOrigin(o)}
                </button>
              ))}
            </div>
          </div>
          <div className="input-row">
            <label>{t("difficultyLbl")}</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Easy", "Medium", "Hard"].map(d => (
                <button
                  key={d}
                  type="button"
                  className={`btn sm ${draft.difficulty === d ? "primary" : ""}`}
                  onClick={() => setDraft({ ...draft, difficulty: d })}
                >{tDifficulty(d)}</button>
              ))}
            </div>
          </div>
          <div className="input-row">
            <label>{t("nutritionPerServing")}</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 6, maxWidth: 480 }}>
              {[
                ["cal", t("calories")],
                ["protein", t("proteinG")],
                ["carbs", t("carbsG")],
                ["fat", t("fatG")],
                ["fiber", t("fiberG")],
                ["sodium", t("sodiumMg")],
              ].map(([key, label]) => (
                <label key={key} style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {label}
                  <input
                    type="number"
                    value={draft.nutrition?.[key] || ""}
                    onChange={(e) => setDraft({
                      ...draft,
                      nutrition: { ...(draft.nutrition || {}), [key]: e.target.value === "" ? 0 : +e.target.value }
                    })}
                    style={{ width: "100%", marginTop: 2 }}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="input-row">
            <label>{t("servingsDefaultLbl")}</label>
            <div>
              <input type="number" value={draft.servingsDefault || ""} onChange={(e) => setDraft({ ...draft, servingsDefault: e.target.value === "" ? 0 : +e.target.value })} style={{ width: 100 }} />
            </div>
          </div>

          {/* BODY: the actual recipe content */}
          <div className="input-row" style={{ alignItems: "stretch" }}>
            <label>{t("ingredients")}</label>
            <div>
              <IngredientsEditor
                ingredients={draft.ingredients}
                onChange={(ings) => setDraft({ ...draft, ingredients: ings })}
              />
              {FLAGS.extractText && (
              <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => alert("AI would fill in missing quantities, units, and pantry-staple defaults.")}>
                <Icon name="sparkle" size={12} /> {t("aiFillMissing")}
              </button>
              )}
            </div>
          </div>
          <div className="input-row">
            <label>{t("dietPrefsLbl")}</label>
            <div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {DIETS.map(d => (
                  <button
                    key={d}
                    className={`filter-pill ${draft.diet.includes(d) ? "on" : ""}`}
                    onClick={() => setDraft(p => ({ ...p, diet: p.diet.includes(d) ? p.diet.filter(x => x !== d) : [...p.diet, d] }))}
                  >{tDiet(d)}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="input-row">
            <label>{t("overnightStep")}</label>
            <div className="overnight-toggle">
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={draft.steps.some(s => s.overnight)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      if (!draft.steps.some(s => s.overnight)) {
                        setDraft({
                          ...draft,
                          steps: [
                            {
                              t: "The day before (overnight step)",
                              d: "Park in the fridge / freezer / counter overnight.",
                              mins: 480,
                              precision: "patient",
                              overnight: true,
                              section: "The day before",
                            },
                            ...draft.steps.map(s => ({ ...s, section: s.section || "Cooking day" })),
                          ],
                        });
                      }
                    } else {
                      setDraft({
                        ...draft,
                        steps: draft.steps
                          .filter(s => !s.overnight)
                          .map(s => s.section === "Cooking day" ? { ...s, section: null } : s),
                      });
                    }
                  }}
                />
                <span>{t("recipeHasOvernight")}</span>
              </label>
              <div className="hint">
                {t("overnightHint")}
              </div>
            </div>
          </div>
          <div className="input-row" style={{ alignItems: "stretch" }}>
            <label>{t("steps")}</label>
            <div>
              <StepsEditor
                steps={draft.steps}
                onChange={(steps) => setDraft({ ...draft, steps })}
              />
            </div>
          </div>
          <div className="input-row" style={{ alignItems: "stretch" }}>
            <label>{t("cooksNotesTipsLbl")}</label>
            <div>
              {(draft.tips || []).map((tip, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 24px", gap: 6, marginBottom: 6 }}>
                  <input
                    type="text"
                    value={tip}
                    placeholder={t("exampleTip")}
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
                <Icon name="plus" size={12} /> {t("addTip")}
              </button>
            </div>
          </div>

          {/* TIMING (kept near the bottom — feels more like a stat than
              identity, and the cook usually fills it in once the steps
              are written) */}
          <div className="input-row">
            <label>{t("prepCookMin")}</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" value={draft.prep || ""} onChange={(e) => setDraft({ ...draft, prep: e.target.value === "" ? 0 : +e.target.value })} placeholder={t("prepPh")} style={{ width: 120 }} />
              <span style={{ color: "var(--ink-3)", fontFamily: "var(--mono)" }}>/</span>
              <input type="number" value={draft.cook || ""} onChange={(e) => setDraft({ ...draft, cook: e.target.value === "" ? 0 : +e.target.value })} placeholder={t("cookPh")} style={{ width: 120 }} />
            </div>
          </div>

          <div className="input-row">
            <label>{t("heroPhotoLbl")}</label>
            <div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 100, height: 80, backgroundImage: `url(${draft.photo})`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--rule)", borderRadius: 4 }} />
                <div style={{ flex: 1 }}>
                  <label className="btn sm" style={{ cursor: authEmail && !uploadingPhoto ? "pointer" : "not-allowed", opacity: authEmail && !uploadingPhoto ? 1 : 0.5 }}>
                    <Icon name="camera" size={12} /> {uploadingPhoto ? t("uploading") : t("uploadPhoto")}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!authEmail || uploadingPhoto}
                      style={{ display: "none" }}
                      onChange={(e) => uploadPhoto(e.target.files?.[0])}
                    />
                  </label>
                  {FLAGS.extractImage && (
                  <button className="btn ghost sm" style={{ marginLeft: 6 }}><Icon name="sparkle" size={12} /> {t("aiGenerateFromTitle")}</button>
                  )}
                  {photoError && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#933" }}>{photoError}</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* "Original recipe card images" — only appears once the
              recipe has source photos attached. Mirrors the overnight
              toggle pattern: a checkbox flips whether the reveal icon
              shows on the recipe page, and a thumbnail strip lets the
              cook drop pages they don't want kept. */}
          {draft.sourcePhotos?.length > 0 && (
            <div className="input-row">
              <label>{t("originalRecipeImages")}</label>
              <div className="overnight-toggle">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {draft.sourcePhotos.map((url, i) => (
                    <div key={url} style={{ position: "relative", width: 80 }}>
                      <div style={{
                        width: 80, height: 80,
                        backgroundImage: `url(${url})`,
                        backgroundSize: "cover", backgroundPosition: "center",
                        border: "1px solid var(--rule)", borderRadius: 4,
                      }} />
                      <button
                        type="button"
                        onClick={() => setDraft({
                          ...draft,
                          sourcePhotos: draft.sourcePhotos.filter((_, j) => j !== i),
                        })}
                        style={{
                          position: "absolute", top: -8, right: -8,
                          width: 22, height: 22, borderRadius: "50%",
                          border: "1px solid var(--rule)", background: "var(--paper)",
                          cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 14,
                        }}
                        aria-label={t("removePage")}
                      >×</button>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, textAlign: "center" }}>
                        {t("pageN").replace("{n}", i + 1)}
                      </div>
                    </div>
                  ))}
                </div>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={!!draft.showSourcePhotos}
                    onChange={(e) => setDraft({ ...draft, showSourcePhotos: e.target.checked })}
                  />
                  <span>{t("showOnRecipePage")}</span>
                </label>
                <div className="hint">{t("originalImagesHint")}</div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 32, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn" onClick={onClose} disabled={saving}>{t("cancel")}</button>
            <button className="btn primary" onClick={save} disabled={saving || !authEmail}>
              {saving ? t("saving") : t("saveToCookbook")}
            </button>
          </div>
        </div>
      )}

      {mode === "photo" && (
        <div style={{ maxWidth: 720 }}>
          <div
            className="ai-drop"
            style={{
              textAlign: "center",
              padding: 48,
              outline: dragHover ? "2px dashed var(--accent, #8a6a3a)" : "none",
              outlineOffset: -8,
              background: dragHover ? "var(--paper-2)" : undefined,
              transition: "background 120ms",
            }}
            onDragOver={(e) => {
              // Only react to file drags, and only if there's room
              // in the queue. preventDefault is required to mark this
              // as a valid drop target.
              if (extracting) return;
              if (!e.dataTransfer?.types?.includes("Files")) return;
              e.preventDefault();
              if (!dragHover) setDragHover(true);
            }}
            onDragLeave={(e) => {
              // The drag-leave event fires for child elements too, so
              // we only clear the highlight when leaving the wrapper.
              if (e.currentTarget.contains(e.relatedTarget)) return;
              setDragHover(false);
            }}
            onDrop={(e) => {
              if (extracting) return;
              e.preventDefault();
              setDragHover(false);
              enqueueImages(e.dataTransfer?.files);
            }}
          >
            <Icon name="camera" size={48} />
            <h3 style={{ marginTop: 16 }}>{t("snapPhotoOfCookbook")}</h3>
            <div style={{ color: "var(--ink-3)", marginTop: 8, fontFamily: "var(--serif)" }}>
              {t("takePhotoHelper")}
            </div>

            {pendingImages.length > 0 && (
              <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                {pendingImages.map((p, i) => (
                  <div key={p.preview} style={{ position: "relative", width: 96 }}>
                    <div style={{
                      width: 96, height: 96,
                      backgroundImage: `url(${p.preview})`,
                      backgroundSize: "cover", backgroundPosition: "center",
                      border: "1px solid var(--rule)", borderRadius: 4,
                    }} />
                    <button
                      type="button"
                      onClick={() => removeQueued(i)}
                      disabled={extracting}
                      style={{
                        position: "absolute", top: -8, right: -8,
                        width: 22, height: 22, borderRadius: "50%",
                        border: "1px solid var(--rule)", background: "var(--paper)",
                        cursor: extracting ? "not-allowed" : "pointer",
                        padding: 0, lineHeight: 1, fontSize: 14,
                      }}
                      aria-label={t("removePage")}
                    >×</button>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                      {t("pageN").replace("{n}", i + 1)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 24, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {/* Take photo: capture="environment" makes iOS open the
                  rear camera directly. Each tap appends another shot
                  to the queue. */}
              <label className="btn" style={{ cursor: extracting ? "not-allowed" : "pointer", opacity: extracting ? 0.5 : 1 }}>
                <Icon name="camera" size={13} /> {t("takePhoto")}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={extracting}
                  style={{ display: "none" }}
                  onChange={(e) => { enqueueImages(e.target.files); e.target.value = ""; }}
                />
              </label>
              {/* Upload: no capture attr → opens the photo library,
                  multi-select allowed. */}
              <label className="btn" style={{ cursor: extracting ? "not-allowed" : "pointer", opacity: extracting ? 0.5 : 1 }}>
                {t("uploadImage")}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={extracting}
                  style={{ display: "none" }}
                  onChange={(e) => { enqueueImages(e.target.files); e.target.value = ""; }}
                />
              </label>
              {pendingImages.length > 0 && (
                <button
                  className="btn accent"
                  onClick={runFromImages}
                  disabled={extracting}
                >
                  {extracting
                    ? t("extracting")
                    : <><Icon name="sparkle" size={13} /> {t("extractRecipeN").replace("{n}", pendingImages.length)}</>}
                </button>
              )}
            </div>
            <div style={{ marginTop: 20, fontSize: 12, color: "var(--ink-3)" }}>
              <span className="ai-sparkle"><Icon name="sparkle" size={11} /> AI-parsed</span> · {t("multiPagePhotoHelper")}
            </div>
          </div>
        </div>
      )}

      {mode === "url" && (
        <div style={{ maxWidth: 720 }}>
          <div className="ai-drop">
            <div className="ai-sparkle" style={{ marginBottom: 12 }}>
              <Icon name="sparkle" size={12} /> {t("linkToUrl")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ flex: 1, padding: 10, border: "1px solid var(--rule)", borderRadius: 4, background: "var(--paper)" }}
                placeholder={t("pasteUrlHere")}
                value={aiUrl}
                onChange={(e) => setAiUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runFromUrl(); }}
                disabled={extracting}
              />
              <button className="btn accent" onClick={runFromUrl} disabled={!aiUrl.trim() || extracting}>
                {extracting ? t("extracting") : <><Icon name="sparkle" size={13} /> {t("fetchAndParse")}</>}
              </button>
            </div>
            <div style={{ marginTop: 16, fontSize: 13, color: "var(--ink-3)" }}>
              {t("fetchUrlHelper")}
            </div>
          </div>
        </div>
      )}
      </fieldset>
    </div>
  );
}

