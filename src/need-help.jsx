// Need Help — AI chat affordance. Used inline below the steps section
// and (in compact form) inside cook mode for per-step assistance.

import { useState, useEffect, useRef } from "react";
import { Icon, signInUrl } from "./helpers.jsx";

// Curated prompts shown as chips. Adapts to whether we're in cook mode
// (with a current step) or in the full-page steps section.
function makeHelpPrompts(recipe, currentStep) {
  const base = [
    { label: "I'm missing an ingredient", t: `I don't have one of the ingredients for ${recipe.title}. What can I sub?` },
    { label: "I added too much…", t: "I accidentally added too much of one ingredient — how do I save this?" },
    { label: "It's overcooking", t: "I think it's overcooking. How do I rescue it?" },
    { label: "Substitute for diet", t: "What's a way to adapt this for a diet restriction?" },
    { label: "Make it ahead", t: "Can this be made ahead, and how?" },
  ];
  if (currentStep) {
    return [
      { label: `Help with: ${currentStep.t}`, t: `I'm on the step "${currentStep.t}". ${currentStep.d.slice(0, 80)}… What if it doesn't look right?` },
      ...base,
    ];
  }
  return base;
}

export function NeedHelp({ recipe, currentStep, compact, defaultOpen, authEmail, servings, weight, appliedAdjustments }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [text, setText] = useState("");
  const [turns, setTurns] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const convRef = useRef(null);

  const submit = async (promptText) => {
    const q = (promptText ?? text).trim();
    if (!q) return;
    if (!authEmail) {
      setError("Sign in to ask the kitchen AI.");
      return;
    }
    const nextTurns = [...turns, { role: "you", text: q }];
    setTurns(nextTurns);
    setText("");
    setThinking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/help", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          recipe,
          turns: nextTurns,
          currentStep,
          servings,
          weight,
          appliedAdjustments,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Help failed (${res.status})`);
      }
      const { answer } = await res.json();
      setTurns(t => [...t, { role: "ai", text: answer }]);
    } catch (err) {
      // Roll back the user's turn so the input keeps the typed text
      // and they can retry without re-typing.
      setTurns(turns);
      setText(q);
      setError(err.message || "Could not reach the kitchen AI.");
    } finally {
      setThinking(false);
    }
  };

  useEffect(() => {
    if (convRef.current) convRef.current.scrollTop = convRef.current.scrollHeight;
  }, [turns, thinking]);

  const prompts = makeHelpPrompts(recipe, currentStep);

  return (
    <details className="need-help" open={open} onToggle={(e) => setOpen(e.target.open)}>
      <summary className="head" onClick={(e) => { e.preventDefault(); setOpen(o => !o); }}>
        <div className="icon"><Icon name="sparkle" size={15} /></div>
        <div className="text">
          <div className="t">Need help? Ask the kitchen AI.</div>
          <div className="s">
            {currentStep
              ? `Stuck on step "${currentStep.t}"? Get a hand.`
              : "Missing an ingredient · added too much · running behind. We've got you."}
          </div>
        </div>
        <div className="chev">›</div>
      </summary>
      <div className="body">
        <div className="quick-prompts">
          {prompts.map((p, i) => (
            <button key={i} className="chip" onClick={() => submit(p.t)}>
              <Icon name="sparkle" size={10} /> {p.label}
            </button>
          ))}
        </div>

        <div className="input-area">
          <textarea
            ref={inputRef}
            placeholder="Ask anything — 'I'm out of buttermilk', 'too much salt', 'can I bake this tomorrow?'…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            rows={2}
            disabled={!authEmail}
          />
          <button className="btn primary sm" disabled={!text.trim() || thinking || !authEmail} onClick={() => submit()}>
            <Icon name="sparkle" size={11} /> Ask
          </button>
        </div>

        {!authEmail && (
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--ink-3)" }}>
            <a href={signInUrl()}>Sign in</a> to ask the kitchen AI.
          </div>
        )}
        {error && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#933" }}>{error}</div>
        )}

        {turns.length > 0 && (
          <div className="conversation" ref={convRef}>
            {turns.map((t, i) => (
              <div className={`turn ${t.role}`} key={i}>
                {t.role === "ai" && (
                  <div>
                    <div className="label">Kitchen AI</div>
                    <div className="bubble">{t.text}</div>
                  </div>
                )}
                {t.role === "you" && (
                  <div className="bubble">{t.text}</div>
                )}
              </div>
            ))}
            {thinking && (
              <div className="turn ai">
                <div>
                  <div className="label">Kitchen AI</div>
                  <div className="bubble thinking">Thinking…</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

