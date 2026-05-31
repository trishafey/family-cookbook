// Cooking mode — one step at a time, full-screen, with reverse-timing.

import { useState, useEffect, useMemo, useRef } from "react";
import { useStorage, scheduleForFinish, fmtTime, fmtDuration, formatQty, formatIngredientQty, Icon, logEvent } from "./helpers.jsx";
import { TimeOfDayInput, Lightbox } from "./ui.jsx";
import { NeedHelp } from "./need-help.jsx";
import { useLang } from "./i18n.js";
import { FLAGS } from "./config/flags.js";

export function CookMode({ recipe, steps, ingredients, finishTime, setFinishTime, onClose, authEmail, onSaveRecipe }) {
  const { t, tPrecision } = useLang();
  const [idx, setIdx] = useStorage(`cookmode:${recipe.id}:idx`, 0);
  const [done, setDone] = useStorage(`cookmode:${recipe.id}:done`, []);

  // Photos taken during this cook-mode session, keyed by step index.
  // Overlays whatever's already on the step so the cook sees the new
  // shot immediately; we also persist via onSaveRecipe so it sticks
  // for next time and shows in the editor / recipe page.
  const [sessionPhotos, setSessionPhotos] = useState({});
  const [capturingIdx, setCapturingIdx] = useState(null);

  // Analytics: log one start per cook-mode session and one finish
  // (with the highest step reached) when the modal unmounts. The
  // session boundary is the component's lifetime, not the recipe id.
  // Same cleanup also resets the saved progress so re-entering
  // cook mode later starts fresh at step 1 with nothing checked
  // off — the previous run's ticks shouldn't leak into the next
  // cook session.
  const maxStepRef = useRef(idx);
  useEffect(() => {
    logEvent("cook-mode-start", recipe.id, { totalSteps: steps.length });
    return () => {
      logEvent("cook-mode-finish", recipe.id, {
        stepsReached: maxStepRef.current + 1,
        totalSteps: steps.length,
      });
      setDone([]);
      setIdx(0);
    };
    // Intentionally empty deps — we want one start at mount, one
    // finish at unmount. recipe.id is stable for this modal session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (idx > maxStepRef.current) maxStepRef.current = idx;
  }, [idx]);
  // Per-step start-time overrides, stored as ISO strings. Editing a
  // step's start time anchors that step at the new time; subsequent
  // steps then flow forward from it, so the rest of the timeline
  // shifts automatically. Persists so a refresh keeps the cook's
  // running adjustments.
  const [startOverridesRaw, setStartOverrides] = useStorage(`cookmode:${recipe.id}:startOverrides`, {});

  // The original backward-from-finish schedule, recomputed when
  // the recipe or finish time changes.
  const baseSchedule = useMemo(
    () => scheduleForFinish(steps, finishTime),
    [steps, finishTime]
  );

  // Effective schedule = walk forward, honouring any overrides. Step 0
  // defaults to the original start; later steps default to the previous
  // step's end (so durations stay correct).
  const { schedule, startTime } = useMemo(() => {
    const out = new Array(steps.length);
    let prevEnd = null;
    for (let i = 0; i < steps.length; i++) {
      const overrideRaw = startOverridesRaw[i];
      const overrideDate = overrideRaw ? new Date(overrideRaw) : null;
      const start = overrideDate
        ? overrideDate
        : prevEnd != null ? new Date(prevEnd) : new Date(baseSchedule.schedule[i].start);
      const mins = steps[i].mins || 0;
      const end = new Date(start.getTime() + mins * 60000);
      out[i] = { ...baseSchedule.schedule[i], start, end };
      prevEnd = end.getTime();
    }
    return { schedule: out, startTime: out.length ? out[0].start : finishTime };
  }, [steps, baseSchedule, startOverridesRaw, finishTime]);

  const setStepStart = (i, newDate) => {
    setStartOverrides(o => ({ ...o, [i]: newDate.toISOString() }));
  };
  const hasOverrides = Object.keys(startOverridesRaw).length > 0;
  const resetAdjustments = () => {
    if (!confirm(t("resetAllAdjustments"))) return;
    setStartOverrides({});
  };
  const [helpOpen, setHelpOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  const cur = steps[idx];
  const curSched = schedule[idx];
  // Display photo: locally-captured shot wins over whatever's saved
  // (covers the brief window between upload and parent re-render).
  const curPhoto = sessionPhotos[idx] || cur.photo;

  // Snap a photo from the device camera, upload to R2, then PATCH
  // the recipe so the photo persists. The session-state overlay
  // makes the photo visible to the cook the moment the upload
  // finishes, before the server round-trip completes.
  const captureStepPhoto = async (file) => {
    if (!file || !onSaveRecipe) return;
    setCapturingIdx(idx);
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
      setSessionPhotos(p => ({ ...p, [idx]: url }));
      const nextSteps = recipe.steps.map((s, i) => i === idx ? { ...s, photo: url } : s);
      await onSaveRecipe({ ...recipe, steps: nextSteps });
    } catch (err) {
      alert(err.message || "Photo upload failed");
    } finally {
      setCapturingIdx(null);
    }
  };

  // Mark-as-done is implicit: clicking Next means "I finished this step",
  // clicking Previous means "I'm going back to redo something earlier"
  // — so we untick the step we're returning to. Cleaner than juggling a
  // separate done button.
  const goNext = () => {
    setDone(d => d.includes(idx) ? d : [...d, idx]);
    setIdx(i => Math.min(steps.length - 1, i + 1));
  };
  const goPrev = () => {
    if (idx === 0) return;
    setDone(d => d.filter(x => x !== idx - 1));
    setIdx(i => Math.max(0, i - 1));
  };

  const onKey = (e) => {
    if (e.key === "ArrowRight") goNext();
    if (e.key === "ArrowLeft")  goPrev();
    if (e.key === "Escape") onClose();
  };
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Close inline help whenever the step changes
  useEffect(() => { setHelpOpen(false); }, [idx]);

  return (
    <div className="cookmode-overlay" data-screen-label={`03 Cook mode: ${recipe.title}`}>
      <div className="cookmode-head">
        <div className="where">
          <span className="accent">{recipe.author}'s</span> {recipe.title}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("doneBy")}</span>
          <TimeOfDayInput value={finishTime} onChange={setFinishTime} />
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", padding: "4px 10px", background: "var(--paper-2)", borderRadius: 4 }}>
            {t("startAt")} {fmtTime(startTime)}
          </span>
          {hasOverrides && (
            <button type="button" className="btn ghost sm" onClick={resetAdjustments} title={t("resetAllAdjustments")}>{t("reset")}</button>
          )}
          <button className="btn" onClick={onClose}><Icon name="x" size={16} /> {t("exit")}</button>
        </div>
      </div>

      <div className="cookmode-body">
        {/* Sidebar: timeline & ingredients */}
        <div className="cookmode-side">
          <div className="eyebrow" style={{ marginBottom: 12 }}>{t("timeline")}</div>
          <div className="cookmode-timeline">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`row ${i === idx ? "active" : ""} ${done.includes(i) ? "done" : ""}`}
              >
                <input
                  type="time"
                  className="when"
                  value={`${String(schedule[i].start.getHours()).padStart(2, "0")}:${String(schedule[i].start.getMinutes()).padStart(2, "0")}`}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const [hh, mm] = e.target.value.split(":").map(Number);
                    const d = new Date(schedule[i].start);
                    d.setHours(hh, mm, 0, 0);
                    setStepStart(i, d);
                  }}
                  title="Edit to shift the rest of the timeline"
                />
                <span className="title" onClick={() => setIdx(i)}>{s.t}</span>
              </div>
            ))}
          </div>

          <div className="eyebrow" style={{ marginTop: 32, marginBottom: 12 }}>{t("ingredientsOnHand")}</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12.5 }}>
            {ingredients.map((i, idx) => (
              <li key={idx} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 8, padding: "4px 0", borderBottom: "1px dotted var(--rule)" }}>
                <span className="mono" style={{ color: "var(--accent)" }}>{formatIngredientQty(i)}</span>
                <span style={{ color: "var(--ink-2)" }}>{i.item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Main step */}
        <div className="cookmode-main">
          <div className="cookmode-step-num">
            {t("step").toUpperCase()} {String(idx + 1).padStart(2, "0")} {t("of").toUpperCase()} {String(steps.length).padStart(2, "0")} · {tPrecision(cur.precision).toUpperCase()}
          </div>
          <h1 className="cookmode-step-title">{cur.t}</h1>
          <div className={`cookmode-step-body ${curPhoto ? "has-photo" : ""}`}>
            <p className="cookmode-step-desc">{cur.d}</p>
            {curPhoto && (
              <img
                className="cookmode-step-photo"
                src={curPhoto}
                alt={`Photo for step: ${cur.t}`}
                onClick={() => setPhotoOpen(true)}
              />
            )}
          </div>

          <div className="cookmode-step-time">
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>{t("startAt")}</div>
              <TimeOfDayInput value={curSched.start} onChange={(d) => setStepStart(idx, d)} />
              <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 4, fontStyle: "italic" }}>
                {t("editToShift")}
              </div>
            </div>
            <div style={{ height: 32, width: 1, background: "var(--rule)" }} />
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>{t("takes")}</div>
              <div style={{ fontSize: 16 }}>{fmtDuration(cur.mins)}</div>
            </div>
            {cur.hands != null && (
              <>
                <div style={{ height: 32, width: 1, background: "var(--rule)" }} />
                <div>
                  <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>{t("handsOn")}</div>
                  <div style={{ fontSize: 16 }}>{fmtDuration(cur.hands)}</div>
                </div>
              </>
            )}
            <div style={{ height: 32, width: 1, background: "var(--rule)" }} />
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>{t("doneAt")}</div>
              <div style={{ fontSize: 16 }}>{fmtTime(curSched.end)}</div>
            </div>
          </div>

          <div style={{ marginTop: 40, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {FLAGS.needHelp && (
              <button
                className="btn ai"
                onClick={() => setHelpOpen(o => !o)}
              >
                <Icon name="sparkle" size={15} /> {helpOpen ? "Hide help" : "Need help with this step?"}
              </button>
            )}
            {onSaveRecipe && (
              <label className="btn" style={{ cursor: "pointer" }} title="Snap a photo of this step as you cook">
                <Icon name="camera" size={15} />
                {capturingIdx === idx ? "Uploading…" : (curPhoto ? "Replace photo" : "Take photo")}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    captureStepPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: "auto" }}>
              {done.length} {t("of")} {steps.length} {t("complete")}
            </span>
          </div>

          {helpOpen && (
            <div className="cookmode-help-inline">
              <NeedHelp
                key={idx /* reset turns when step changes */}
                recipe={recipe}
                currentStep={cur}
                defaultOpen={true}
                authEmail={authEmail}
              />
            </div>
          )}
        </div>
      </div>

      <div className="cookmode-foot">
        <div className="nav-btns">
          <button className="btn" onClick={goPrev} disabled={idx === 0}>
            <Icon name="chevL" /> Previous
          </button>
        </div>
        <div className="cookmode-progress">
          <div className="bar" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="nav-btns">
          {idx < steps.length - 1 ? (
            <button className="btn primary" onClick={goNext}>
              Next step <Icon name="chevR" />
            </button>
          ) : (
            <button className="btn accent" onClick={() => { setDone(d => d.includes(idx) ? d : [...d, idx]); onClose(); }}>
              <Icon name="check" /> Done — eat!
            </button>
          )}
        </div>
      </div>

      {photoOpen && curPhoto && (
        <Lightbox src={curPhoto} alt={`Photo for step: ${cur.t}`} onClose={() => setPhotoOpen(false)} />
      )}
    </div>
  );
}

