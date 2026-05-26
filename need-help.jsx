// Need Help — AI chat affordance. Used inline below the steps section
// and (in compact form) inside cook mode for per-step assistance.

const { useState, useEffect, useRef } = React;

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

// Mocked AI: in a real impl, this calls window.claude.complete().
// For the demo we return a written-by-a-cook stub response based on the prompt.
function mockHelpAnswer(prompt, recipe) {
  const p = prompt.toLowerCase();
  if (p.includes("missing") || p.includes("sub")) {
    return `For ${recipe.title}, the most common swaps are: 1) Substitute fresh herbs 1:1 for dried (or use ⅓ if going dried→fresh). 2) Buttermilk = ¾ cup milk + 1 tbsp lemon juice, rest 5 min. 3) Out of red wine? Use beef stock + 1 tbsp red wine vinegar.\n\nIf you tell me which ingredient specifically, I'll give you the closest swap given what else is in the recipe.`;
  }
  if (p.includes("too much")) {
    return `Don't panic. The two most common over-pours:\n• Too much liquid → simmer uncovered to reduce, or stir in a slurry of 1 tbsp cornstarch + 2 tbsp cold water.\n• Too much salt → add a peeled potato while it simmers (pull when done), or stir in a splash of acid + a teaspoon of sugar.\nWhich one is it?`;
  }
  if (p.includes("overcook") || p.includes("burn")) {
    return `Pull it from the heat immediately. If a sauce or stew is scorched at the bottom, transfer the unscorched portion to a clean pot WITHOUT scraping. Add 2 tbsp acid (vinegar / lemon) and a pinch of sugar to mute the bitter notes. Taste before serving.`;
  }
  if (p.includes("ahead") || p.includes("make ahead")) {
    return `${recipe.title} keeps beautifully. Refrigerate up to 3 days, covered tightly. Reheat gently, covered, at 325°F until warmed through — don't blast the heat or the texture goes off. Day-of-eating: pull from fridge 30 min before to take the chill off.`;
  }
  if (p.includes("diet")) {
    return `Most diet adaptations boil down to swapping the binder (flour, gluten) or the fat (butter, dairy). Tell me which restriction and I'll give a step-by-step swap with the closest texture match.`;
  }
  return `Tell me a bit more — what stage are you at, and what does it look or taste like right now? I'll give you the path back.`;
}

function NeedHelp({ recipe, currentStep, compact, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [text, setText] = useState("");
  const [turns, setTurns] = useState([]);
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef(null);
  const convRef = useRef(null);

  const submit = (promptText) => {
    const q = (promptText ?? text).trim();
    if (!q) return;
    setTurns(t => [...t, { role: "you", text: q }]);
    setText("");
    setThinking(true);
    setTimeout(() => {
      const a = mockHelpAnswer(q, recipe);
      setTurns(t => [...t, { role: "ai", text: a }]);
      setThinking(false);
    }, 900);
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
          />
          <button className="btn primary sm" disabled={!text.trim() || thinking} onClick={() => submit()}>
            <Icon name="sparkle" size={11} /> Ask
          </button>
        </div>

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

Object.assign(window, { NeedHelp, mockHelpAnswer });
