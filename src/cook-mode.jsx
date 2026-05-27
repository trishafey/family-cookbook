// Cooking mode — one step at a time, full-screen, with reverse-timing.

import { useState, useEffect, useMemo } from "react";
import { useStorage, scheduleForFinish, fmtTime, fmtDuration, formatQty, Icon } from "./helpers.jsx";
import { TimeOfDayInput } from "./ui.jsx";
import { NeedHelp } from "./need-help.jsx";
import { FLAGS } from "./config/flags.js";

export function CookMode({ recipe, steps, ingredients, finishTime, setFinishTime, onClose }) {
  const [idx, setIdx] = useStorage(`cookmode:${recipe.id}:idx`, 0);
  const [done, setDone] = useStorage(`cookmode:${recipe.id}:done`, []);
  const [helpOpen, setHelpOpen] = useState(false);

  // Reverse-schedule starts so each step has a start clock time
  const { schedule, startTime } = useMemo(() =>
    scheduleForFinish(steps, finishTime), [steps, finishTime]);

  const cur = steps[idx];
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
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Done by</span>
          <TimeOfDayInput value={finishTime} onChange={setFinishTime} />
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", padding: "4px 10px", background: "var(--paper-2)", borderRadius: 4 }}>
            Start at {fmtTime(startTime)}
          </span>
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
              <div style={{ fontSize: 16 }}>{fmtDuration(cur.mins)}</div>
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

