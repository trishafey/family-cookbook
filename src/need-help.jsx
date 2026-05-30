// Need Help — AI chat affordance. Used inline below the steps section
// and (in compact form) inside cook mode for per-step assistance.

import { useState, useEffect, useRef } from "react";
import { Icon, signInUrl } from "./helpers.jsx";

// Curated prompts shown as chips. Adapts to whether we're in cook
// mode (with a current step) or in the full-page steps section.
// Includes the adjust-style chips (GF, dairy-free, weeknight,
// per-recipe extras) that used to live in the standalone "Adjust
// with AI" box — moved here so the cook has one place to ask the
// kitchen AI anything, including dietary swaps. A more dynamic
// per-user variant approach can replace this later.
const PER_RECIPE_PROMPTS = {
  "ewas-pierogies": [
    { label: "Meat filling variation",        t: "How do I make a ground meat filling for these pierogies?" },
    { label: "Sauerkraut & mushroom filling", t: "How do I make a sauerkraut and mushroom filling?" },
    { label: "Blueberry (sweet) pierogies",   t: "Can I make blueberry pierogies with this dough?" },
  ],
  "trish-covid-bread": [
    { label: "Olive + rosemary loaf",     t: "How do I add olives and rosemary to this bread?" },
    { label: "Date, walnut & cinnamon",   t: "How do I make a sweet date-walnut-cinnamon variation?" },
  ],
  "kt-turkey": [
    { label: "Make the stuffing meatless", t: "How do I make the stuffing meatless?" },
  ],
  "block-party-ribs": [
    { label: "Rib broth into tomato soup", t: "How do I use the leftover rib broth for Ryszard's tomato soup?" },
  ],
};

function makeHelpPrompts(recipe, currentStep) {
  const base = [
    { label: "I'm missing an ingredient", t: `I don't have one of the ingredients for ${recipe.title}. What can I sub?` },
    { label: "I added too much…", t: "I accidentally added too much of one ingredient — how do I save this?" },
    { label: "It's overcooking", t: "I think it's overcooking. How do I rescue it?" },
    { label: "Make it ahead", t: "Can this be made ahead, and how?" },
  ];
  // Dietary swap chips — skip the ones the recipe already is.
  const diet = recipe.diet || [];
  const swaps = [];
  if (!diet.includes("Gluten-free")) swaps.push({ label: "Make it gluten-free", t: `What are good gluten-free substitutions for ${recipe.title}?` });
  if (!diet.includes("Dairy-free"))  swaps.push({ label: "Make it dairy-free",  t: `What are good dairy-free substitutions for ${recipe.title}?` });
  swaps.push({ label: "Quicker weeknight version", t: `How do I make a quicker weeknight version of ${recipe.title}?` });
  const perRecipe = PER_RECIPE_PROMPTS[recipe.id] || [];
  if (currentStep) {
    return [
      { label: `Help with: ${currentStep.t}`, t: `I'm on the step "${currentStep.t}". ${currentStep.d.slice(0, 80)}… What if it doesn't look right?` },
      ...base,
      ...swaps,
      ...perRecipe,
    ];
  }
  return [...base, ...swaps, ...perRecipe];
}

// Prompts when the panel is opened against a multi-recipe meal plan
// rather than a single recipe. Different question shape — substitution,
// scaling, prep ordering, drink/side pairings across the dishes.
function makeMealHelpPrompts(recipes) {
  const titles = recipes.map(r => r.title).join(" + ");
  return [
    { label: "What should I prep first?", t: `I'm making ${titles} together. What should I prep first to avoid running around at the end?` },
    { label: "I'm short an ingredient", t: `I'm making ${titles} but I'm missing one of the ingredients. What's the best substitute?` },
    { label: "Halve the whole meal", t: `How do I scale ${titles} down for a smaller group?` },
    { label: "What goes with this?", t: `What's a simple side or drink that would round out ${titles}?` },
    { label: "Make some of it ahead", t: `Which parts of ${titles} can I make ahead, and how far in advance?` },
  ];
}

export function NeedHelp({ recipe, recipes, currentStep, compact, defaultOpen, authEmail, servings, weight, appliedAdjustments }) {
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
          recipes,
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

  const isMeal = !recipe && Array.isArray(recipes) && recipes.length > 0;
  const prompts = isMeal
    ? makeMealHelpPrompts(recipes)
    : makeHelpPrompts(recipe, currentStep);

  return (
    <details className="need-help" open={open} onToggle={(e) => setOpen(e.target.open)}>
      <summary className="head" onClick={(e) => { e.preventDefault(); setOpen(o => !o); }}>
        <div className="icon"><Icon name="sparkle" size={15} /></div>
        <div className="text">
          <div className="t">
            {isMeal ? "Ask the kitchen AI about this meal." : "Need help? Ask the kitchen AI."}
          </div>
          <div className="s">
            {isMeal
              ? "Substitutions · what to prep first · scaling for a smaller group · what to serve with it."
              : currentStep
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

