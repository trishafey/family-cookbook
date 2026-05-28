// Cooking mode — one step at a time, full-screen, with reverse-timing.

import { useState, useEffect, useMemo } from "react";
import { useStorage, scheduleForFinish, fmtTime, fmtDuration, formatQty, Icon } from "./helpers.jsx";
import { TimeOfDayInput } from "./ui.jsx";
import { NeedHelp } from "./need-help.jsx";
import { FLAGS } from "./config/flags.js";

export function CookMode({ recipe, steps, ingredients, finishTime, setFinishTime, onClose }) {
  const [idx, setIdx] = useStorage(`cookmode:${recipe.id}:idx`, 0);
  // Per-step duration override: { [stepIdx]: deltaMinutes }. Lets the
  // cook say 'this took 10 extra minutes' and have the rest of the
  // schedule shift to match. Persists so a refresh doesn't lose the
  // running adjustments.
  const [overrides, setOverrides] = useStorage(`cookmode:${recipe.id}:overrides`, {});
  const [finishShift, setFinishShift] = useStorage(`cookmode:${recipe.id}:shift`, 0);

  const adjustedSteps = useMemo(
    () => steps.map((s, i) => ({ ...s, mins: Math.max(0, (s.mins || 0) + (overrides[i] || 0)) })),
    [steps, overrides]
  );
  const adjustedFinish = useMemo(
    () => new Date(new Date(finishTime).getTime() + (finishShift || 0) * 60000),
    [finishTime, finishShift]
  );

  const bumpStep = (delta) => setOverrides(o => ({ ...o, [idx]: (o[idx] || 0) + delta }));
  const bumpFinish = (delta) => setFinishShift(s => (s || 0) + delta);
  const resetAdjustments = () => {
    if (!confirm("Reset all timing adjustments?")) return;
    setOverrides({});
    setFinishShift(0);
  };
  const [done, setDone] = useStorage(`cookmode:${recipe.id}:done`, []);
  const [helpOpen, setHelpOpen] = useState(false);

  // Reverse-schedule starts so each step has a start clock time. Uses
  // the adjusted step durations and shifted finish so all the
  // start/end pills reflect the cook's live tweaks.
  const { schedule, startTime } = useMemo(() =>
    scheduleForFinish(adjustedSteps, adjustedFinish), [adjustedSteps, adjustedFinish]);

  const cur = adjustedSteps[idx];
  const stepDelta = overrides[idx] || 0;
  const curSched = schedule[idx];

  const onKey = (e) => {
    if (e.key === "ArrowRight") setIdx(i => Math.min(steps.length - 1, i + 1));
    if (e.key === "ArrowLeft")  setIdx(i => Math.max(0, i - 1));
    if (e.key === "Escape") onClose();
    if (e.key === " ") {
      e.preventDefault();
      setDone(d => d.includes(idx) ? d.filter(x => x !== idx) : [...d, idx]);
    }
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
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Done by</span>
          <TimeOfDayInput value={finishTime} onChange={setFinishTime} />
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" className="btn ghost sm" onClick={() => bumpFinish(-15)} title="Push 15 min earlier">−15m</button>
            <button type="button" className="btn ghost sm" onClick={() => bumpFinish(+15)} title="Push 15 min later">+15m</button>
            <button type="button" className="btn ghost sm" onClick={() => bumpFinish(+60)} title="Push 1 hour later">+1h</button>
          </div>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", padding: "4px 10px", background: "var(--paper-2)", borderRadius: 4 }}>
            Start at {fmtTime(startTime)}
          </span>
          {(finishShift !== 0 || Object.keys(overrides).length > 0) && (
            <button type="button" className="btn ghost sm" onClick={resetAdjustments} title="Reset all timing adjustments">Reset</button>
          )}
          <button className="btn" onClick={onClose}><Icon name="x" size={14} /> Exit</button>
        </div>
      </div>

      <div className="cookmode-body">
        {/* Sidebar: timeline & ingredients */}
        <div className="cookmode-side">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Timeline</div>
          <div className="cookmode-timeline">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`row ${i === idx ? "active" : ""} ${done.includes(i) ? "done" : ""}`}
                onClick={() => setIdx(i)}
              >
                <span className="when">{fmtTime(schedule[i].start)}</span>
                <span className="title">{s.t}</span>
              </div>
            ))}
          </div>

          <div className="eyebrow" style={{ marginTop: 32, marginBottom: 12 }}>Ingredients on hand</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12.5 }}>
            {ingredients.map((i, idx) => (
              <li key={idx} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 8, padding: "4px 0", borderBottom: "1px dotted var(--rule)" }}>
                <span className="mono" style={{ color: "var(--accent)" }}>{formatQty(i.qty)} {i.unit}</span>
                <span style={{ color: "var(--ink-2)" }}>{i.item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Main step */}
        <div className="cookmode-main">
          <div className="cookmode-step-num">
            STEP {String(idx + 1).padStart(2, "0")} OF {String(steps.length).padStart(2, "0")} · {cur.precision.toUpperCase()}
          </div>
          <h1 className="cookmode-step-title">{cur.t}</h1>
          <p className="cookmode-step-desc">{cur.d}</p>

          <div className="cookmode-step-time">
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>Start at</div>
              <div className="start">{fmtTime(curSched.start)}</div>
            </div>
            <div style={{ height: 32, width: 1, background: "var(--rule)" }} />
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>Takes</div>
              <div style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}>
                {fmtDuration(cur.mins)}
                {stepDelta !== 0 && (
                  <span style={{ fontSize: 11, color: stepDelta > 0 ? "#C42807" : "var(--ink-3)" }}>
                    ({stepDelta > 0 ? "+" : ""}{stepDelta}m)
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <button type="button" className="btn ghost sm" onClick={() => bumpStep(-5)} title="Took 5 min less">−5m</button>
                <button type="button" className="btn ghost sm" onClick={() => bumpStep(+5)} title="Took 5 min more">+5m</button>
                <button type="button" className="btn ghost sm" onClick={() => bumpStep(+15)} title="Took 15 min more">+15m</button>
              </div>
            </div>
            {cur.hands != null && (
              <>
                <div style={{ height: 32, width: 1, background: "var(--rule)" }} />
                <div>
                  <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>Hands-on</div>
                  <div style={{ fontSize: 16 }}>{fmtDuration(cur.hands)}</div>
                </div>
              </>
            )}
            <div style={{ height: 32, width: 1, background: "var(--rule)" }} />
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>Done at</div>
              <div style={{ fontSize: 16 }}>{fmtTime(curSched.end)}</div>
            </div>
          </div>

          <div style={{ marginTop: 40, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className={`btn ${done.includes(idx) ? "accent" : ""}`}
              onClick={() => setDone(d => d.includes(idx) ? d.filter(x => x !== idx) : [...d, idx])}
            >
              <Icon name="check" size={14} /> {done.includes(idx) ? "Step completed" : "Mark step done"}
            </button>
            {FLAGS.needHelp && (
            <button
              className={`btn ${helpOpen ? "primary" : ""}`}
              onClick={() => setHelpOpen(o => !o)}
            >
              <Icon name="sparkle" size={13} /> {helpOpen ? "Hide help" : "Need help with this step?"}
            </button>
            )}
            <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: "auto" }}>
              {done.length} of {steps.length} complete · press <span className="mono">SPACE</span>
            </span>
          </div>

          {helpOpen && (
            <div className="cookmode-help-inline">
              <NeedHelp
                key={idx /* reset turns when step changes */}
                recipe={recipe}
                currentStep={cur}
                defaultOpen={true}
              />
            </div>
          )}
        </div>
      </div>

      <div className="cookmode-foot">
        <div className="nav-btns">
          <button className="btn" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>
            <Icon name="chevL" /> Previous
          </button>
        </div>
        <div className="cookmode-progress">
          <div className="bar" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="nav-btns">
          {idx < steps.length - 1 ? (
            <button className="btn primary" onClick={() => setIdx(idx + 1)}>
              Next step <Icon name="chevR" />
            </button>
          ) : (
            <button className="btn accent" onClick={onClose}>
              <Icon name="check" /> Done — eat!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

