// Kitchen Experimentation Lab — chat-based recipe discovery / drafting.
// Drafts live as "experiments" until promoted to the main cookbook.

import { useState, useEffect, useRef, useMemo } from "react";
import { Icon, useStorage, fmtDuration, formatQty } from "./helpers.jsx";

// ─────────────────────────────────────────────────────────────
// Mock AI: turns a free-text request into a structured recipe.
// In a real impl this would call window.claude.complete with a
// structured-output prompt.
// ─────────────────────────────────────────────────────────────
function generateExperimentDraft(prompt) {
  const p = prompt.toLowerCase();

  // Seed responses for some plausible prompts. Each returns a recipe object.
  if (p.includes("blueberry") && p.includes("poppy")) {
    return {
      title: "Blueberry Lemon Poppy Seed Rolls",
      blurb: "A cross between the family blueberry rolls and a classic poppy seed muffin. Bright, nutty, weekend-y.",
      time: 90,
      servings: 9,
      ingredients: [
        { qty: 3.25, unit: "cups", item: "all-purpose flour" },
        { qty: 0.25, unit: "cup",  item: "sugar" },
        { qty: 2.25, unit: "tsp",  item: "instant yeast" },
        { qty: 1,    unit: "tbsp", item: "poppy seeds (in the dough)" },
        { qty: 0.75, unit: "cup",  item: "warm whole milk" },
        { qty: 1,    unit: "",     item: "large egg" },
        { qty: 4,    unit: "tbsp", item: "butter, melted" },
        { qty: 2,    unit: "cups", item: "blueberries (frozen, don't thaw)" },
        { qty: 2,    unit: "",     item: "lemons, zested + juiced" },
        { qty: 1,    unit: "cup",  item: "powdered sugar (for glaze)" },
      ],
      steps: [
        "Bloom yeast in warm milk + a pinch of sugar. Sit 5 min.",
        "Mix flour, sugar, salt, poppy seeds. Add yeast mix + egg + butter. Knead 8 min.",
        "First rise: covered, warm spot, 1 hour.",
        "Toss berries with sugar, cornstarch, lemon zest, lemon juice.",
        "Roll dough into a rectangle. Spread filling. Roll up tight.",
        "Slice 9 rolls using dental floss. Second rise 30 min.",
        "Bake 375°F until tops are deep gold. ~28 minutes.",
        "Glaze with powdered sugar + lemon juice + a pinch of poppy seeds.",
      ],
      tips: ["The poppy seeds in the dough are subtle but they're what makes this NOT just a riff on Rosa's rolls.", "Use a Microplane for the lemon — no white pith."],
    };
  }

  if (p.includes("pear") || (p.includes("dark chocolate") && (p.includes("dessert") || p.includes("cake")))) {
    return {
      title: "Pear & Dark Chocolate Skillet Cake",
      blurb: "One pan, brown butter, brandy-poached pears, a tumble of dark chocolate.",
      time: 60,
      servings: 8,
      ingredients: [
        { qty: 3,    unit: "",    item: "ripe but firm pears, sliced" },
        { qty: 2,    unit: "tbsp",item: "brandy or bourbon" },
        { qty: 6,    unit: "tbsp",item: "unsalted butter (for brown butter)" },
        { qty: 0.75, unit: "cup", item: "sugar" },
        { qty: 2,    unit: "",    item: "eggs" },
        { qty: 1.25, unit: "cups",item: "AP flour" },
        { qty: 1,    unit: "tsp", item: "baking powder" },
        { qty: 0.5,  unit: "tsp", item: "kosher salt" },
        { qty: 0.5,  unit: "cup", item: "whole milk" },
        { qty: 1,    unit: "tsp", item: "vanilla" },
        { qty: 4,    unit: "oz",  item: "70% dark chocolate, roughly chopped" },
      ],
      steps: [
        "Toss pears with brandy. Set aside.",
        "Brown the butter in a 10\" skillet until nutty. Pour into a bowl. Cool slightly.",
        "Whisk browned butter, sugar, eggs, vanilla.",
        "Fold in flour, powder, salt, milk.",
        "Pour batter into a buttered skillet. Scatter pears + chocolate over the top.",
        "Bake 350°F ~40 min until set and deeply golden at the edges.",
      ],
      tips: ["Brown butter the night before if you can — flavor opens up.", "Slightly underbake. The skillet keeps cooking it."],
    };
  }

  if (p.includes("ramen") || p.includes("noodle soup")) {
    return {
      title: "30-Minute Pantry Ramen",
      blurb: "Not authentic — fast. Anchovies + miso + soft egg + the noodles you have.",
      time: 30,
      servings: 2,
      ingredients: [
        { qty: 1, unit: "tbsp", item: "sesame oil" },
        { qty: 3, unit: "", item: "garlic cloves, smashed" },
        { qty: 1, unit: "inch", item: "ginger, sliced" },
        { qty: 2, unit: "", item: "anchovy fillets" },
        { qty: 3, unit: "tbsp", item: "white miso" },
        { qty: 4, unit: "cups", item: "chicken or veg stock" },
        { qty: 2, unit: "tbsp", item: "soy sauce" },
        { qty: 2, unit: "tsp", item: "rice vinegar" },
        { qty: 2, unit: "packs", item: "ramen-style noodles" },
        { qty: 2, unit: "", item: "soft-boiled eggs, halved" },
        { qty: 1, unit: "bunch", item: "scallions, sliced" },
      ],
      steps: [
        "Toast garlic + ginger + anchovies in sesame oil 2 min.",
        "Whisk miso into stock. Add to pot. Bring to a simmer.",
        "Add soy + vinegar. Simmer 8 minutes. Strain if you want a clean broth.",
        "Cook noodles per package. Drain.",
        "Bowl: noodles → broth → egg halves → scallions.",
      ],
      tips: ["Anchovies vanish — they just deepen the broth.", "Top with chili crisp if you're feeling it."],
    };
  }

  // Default template: extract a title-ish phrase from the prompt
  const cleaned = prompt.replace(/^(make|i want|let'?s try|can you make|how do i make)\s+/i, "").trim();
  const titleGuess = cleaned.split(/[.,?!]/)[0].slice(0, 60) || "Untitled Experiment";

  return {
    title: titleGuess.replace(/\b\w/g, c => c.toUpperCase()),
    blurb: "A first pass — tell me what you'd change and I'll iterate.",
    time: 45,
    servings: 4,
    ingredients: [
      { qty: 2,    unit: "cups", item: "flour or grain base" },
      { qty: 1,    unit: "",     item: "main protein (your choice)" },
      { qty: 3,    unit: "tbsp", item: "aromatic fat (butter / oil / ghee)" },
      { qty: 4,    unit: "",     item: "garlic cloves" },
      { qty: 0.5,  unit: "cup",  item: "liquid (stock / wine / dairy)" },
      { qty: 1,    unit: "",     item: "acid (lemon / vinegar)" },
      { qty: 0,    unit: "",     item: "salt + pepper to taste" },
    ],
    steps: [
      "Heat the fat. Brown the protein. Set aside.",
      "Sweat aromatics in the rendered fat 5 min.",
      "Add base. Toast briefly.",
      "Add liquid. Simmer 20 minutes.",
      "Return protein. Adjust seasoning. Finish with acid.",
    ],
    tips: ["This is a generic scaffold — push back and I'll give you something specific."],
  };
}

// Generates a fridge-inventory draft when photos are attached.
// In a real impl, vision would actually parse the contents of the photos.
function generateFridgeDraft(photoCount, hint) {
  const h = (hint || "").toLowerCase();
  if (h.includes("dinner") || h.includes("tonight")) {
    return {
      title: "Pantry Skillet Dinner",
      blurb: `Built from what I can see across ${photoCount} ${photoCount === 1 ? "photo" : "photos"} — a one-pan dinner using what's already on hand.`,
      time: 35,
      servings: 4,
      ingredients: [
        { qty: 1,    unit: "lb",   item: "protein I spotted (chicken thighs / sausage / tofu)" },
        { qty: 1,    unit: "",     item: "yellow onion, diced" },
        { qty: 3,    unit: "",     item: "garlic cloves" },
        { qty: 1,    unit: "can",  item: "tomatoes (or 2 fresh, chopped)" },
        { qty: 1,    unit: "cup",  item: "stock or water" },
        { qty: 1,    unit: "cup",  item: "starch on hand (rice, pasta, beans)" },
        { qty: 0,    unit: "",     item: "olive oil, salt, pepper, whatever herb you have" },
      ],
      steps: [
        "Heat olive oil. Brown protein hard on one side, 5 min. Set aside.",
        "Sweat onion + garlic in the rendered fat 4 min.",
        "Add tomatoes + stock. Simmer 3 min.",
        "Return protein + starch. Cover, reduce, cook 18 min.",
        "Adjust salt + finish with herbs.",
      ],
      tips: ["Tell me what specific items I missed in the photo and I'll rewrite the recipe to use them."],
    };
  }
  return {
    title: "What's-in-the-fridge stir-fry",
    blurb: `Quick read of ${photoCount} ${photoCount === 1 ? "photo" : "photos"} — here's a riff that uses what's there. Tell me what to swap.`,
    time: 20,
    servings: 2,
    ingredients: [
      { qty: 2,    unit: "tbsp", item: "neutral oil" },
      { qty: 4,    unit: "",     item: "garlic cloves, smashed" },
      { qty: 1,    unit: "inch", item: "ginger, julienned" },
      { qty: 12,   unit: "oz",   item: "mixed vegetables I spotted (peppers, broccoli, scallions, mushrooms)" },
      { qty: 8,    unit: "oz",   item: "protein on hand (tofu / chicken / shrimp / leftover beef)" },
      { qty: 2,    unit: "tbsp", item: "soy sauce" },
      { qty: 1,    unit: "tbsp", item: "rice vinegar or lemon juice" },
      { qty: 1,    unit: "tsp",  item: "sesame oil to finish" },
      { qty: 2,    unit: "cups", item: "cooked rice (or noodles)" },
    ],
    steps: [
      "Heat the oil ripping hot. Sear protein in batches, set aside.",
      "Toss garlic + ginger 30 sec. Don't burn.",
      "Add hardiest veg first (broccoli, peppers). 2 min.",
      "Add softer veg + protein back. Splash of soy + vinegar.",
      "Off heat: sesame oil. Over rice.",
    ],
    tips: ["Snap another photo if I missed key items — I'll redo the ingredient list."],
  };
}

export function draftToRecipe(draft, status = "experiment") {
  // Map the lab draft into our full recipe shape so it can live in the
  // cookbook (or in the experiment list).
  return {
    id: `experiment-${Date.now()}`,
    title: draft.title,
    subtitle: draft.blurb,
    author: status === "promoted" ? "Experiment lab" : "You · in the lab",
    cuisine: "Experimental",
    course: "Dinner",
    diet: [],
    occasion: "Solo",
    photo: "https://images.unsplash.com/photo-1547573854-74d2a71d0826?w=1200&q=80",
    photoTone: "#6e7a3a",
    favorite: false,
    rating: 0,
    cookCount: 0,
    servingsDefault: draft.servings || 4,
    prep: 10, cook: Math.max(0, (draft.time || 30) - 10), total: draft.time || 30,
    difficulty: "Medium",
    nutrition: { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 },
    ingredients: draft.ingredients.map(i => ({ ...i, grp: "Ingredients" })),
    steps: draft.steps.map((d) => ({
      t: d.split(/[.:]/)[0].slice(0, 60),
      d, mins: Math.ceil((draft.time || 30) / draft.steps.length), precision: "medium",
    })),
    tips: draft.tips || [],
    comments: [],
    _experiment: true,
  };
}

// ─────────────────────────────────────────────────────────────
// ExperimentationLab — the page
// ─────────────────────────────────────────────────────────────
export function ExperimentationLab({ onClose, onPromote, allRecipes }) {
  const [experiments, setExperiments] = useStorage("lab:experiments", []);
  const [activeId, setActiveId] = useState(null);
  const [chat, setChat] = useState([]); // { role: "you"|"ai", text, draft?, photos? }
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [attachments, setAttachments] = useState([]); // [{url, name}]
  const [attachMenu, setAttachMenu] = useState(false);
  const bodyRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const active = experiments.find(e => e.id === activeId);

  // Loading an experiment loads its chat history
  useEffect(() => {
    if (active) setChat(active.chat || []);
    else setChat([]);
  }, [activeId]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [chat, thinking]);

  const startNew = () => {
    setActiveId(null);
    setChat([]);
    setText("");
  };

  const send = (q) => {
    const txt = (q ?? text).trim();
    const hasPhotos = attachments.length > 0;
    if (!txt && !hasPhotos) return;
    const youTurn = { role: "you", text: txt || "(here's what's in my fridge)", photos: attachments };
    const nextChat = [...chat, youTurn];
    setChat(nextChat);
    setText("");
    setAttachments([]);
    setThinking(true);
    setTimeout(() => {
      // If photos were attached, generate a "based on your fridge" draft
      const draft = hasPhotos
        ? generateFridgeDraft(attachments.length, txt)
        : generateExperimentDraft(txt);
      const greeting = hasPhotos
        ? `Looking at the ${attachments.length === 1 ? "photo" : `${attachments.length} photos`}, here's what I'd make with what you've got. Tell me what to swap or build around.`
        : `Here's a first pass at "${draft.title}". Tell me what to change and I'll iterate.`;
      const aiTurn = { role: "ai", text: greeting, draft };
      setChat([...nextChat, aiTurn]);
      setThinking(false);
    }, 1100);
  };

  const handleFiles = (files) => {
    const list = Array.from(files || []).slice(0, 6);
    const items = list.map(f => ({ url: URL.createObjectURL(f), name: f.name }));
    setAttachments(a => [...a, ...items].slice(0, 6));
  };
  const removeAttachment = (i) => {
    setAttachments(a => {
      try { URL.revokeObjectURL(a[i].url); } catch {}
      return a.filter((_, j) => j !== i);
    });
  };

  const saveAsExperiment = (draft) => {
    if (active) {
      // Update existing
      const updated = experiments.map(e => e.id === active.id ? { ...e, draft, chat, updatedAt: Date.now() } : e);
      setExperiments(updated);
      return;
    }
    const exp = {
      id: `exp-${Date.now()}`,
      title: draft.title,
      blurb: draft.blurb,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chat,
      draft,
    };
    setExperiments([exp, ...experiments]);
    setActiveId(exp.id);
  };

  const promote = (exp) => {
    const r = draftToRecipe(exp.draft, "promoted");
    onPromote(r);
    const updated = experiments.map(e => e.id === exp.id ? { ...e, status: "promoted" } : e);
    setExperiments(updated);
  };

  const remove = (id) => {
    setExperiments(experiments.filter(e => e.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const quickPrompts = [
    "Blueberry lemon poppy seed rolls",
    "A dessert with pears and dark chocolate",
    "30-minute pantry ramen",
    "Brunch dish using leftover roast beef",
    "Vegetarian Sunday dinner the kids will eat",
  ];

  const latestDraft = useMemo(() => {
    for (let i = chat.length - 1; i >= 0; i--) if (chat[i].draft) return chat[i].draft;
    return null;
  }, [chat]);

  return (
    <div className="lab-page" data-screen-label="07 Experimentation Lab">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      <div className="lab-header">
        <div className="lhs">
          <div className="eyebrow">Kitchen experimentation</div>
          <h1>The <em>Lab</em></h1>
          <div className="intro">
            Try new recipes with AI. Iterate in chat — when something's worth keeping, save it as an experiment. When it's proven, promote it to the family cookbook.
          </div>
        </div>
        <div>
          <button className="btn primary" onClick={startNew}>
            <Icon name="plus" /> New experiment
          </button>
        </div>
      </div>

      {/* Existing experiments */}
      {experiments.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Your experiments</div>
          <div className="lab-experiments-row">
            {experiments.map(e => (
              <div
                key={e.id}
                className={`experiment-card ${activeId === e.id ? "active" : ""}`}
                onClick={() => setActiveId(e.id)}
              >
                <span className={`status ${e.status}`}>
                  {e.status === "pending" ? "Pending trial" : "In the cookbook"}
                </span>
                <div className="name">{e.title}</div>
                <div className="blurb">{e.blurb}</div>
                <div className="meta">
                  <span>{(e.draft.steps?.length || 0)} steps · {fmtDuration(e.draft.time || 30)}</span>
                  <span>{new Date(e.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
                {e.status === "pending" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button
                      className="btn accent sm"
                      onClick={(ev) => { ev.stopPropagation(); promote(e); }}
                      title="Add to cookbook"
                    >
                      <Icon name="bookmark" size={11} /> Promote
                    </button>
                    <button
                      className="btn ghost sm"
                      onClick={(ev) => { ev.stopPropagation(); remove(e.id); }}
                      title="Discard"
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Chat */}
      <div className="lab-chat">
        <div className="lab-chat-header">
          <div className="title-block">
            <div className="label">{active ? "Working on" : "New experiment"}</div>
            {active && <h3>{active.title}</h3>}
          </div>
          {latestDraft && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn sm" onClick={() => saveAsExperiment(latestDraft)}>
                <Icon name="bookmark" size={12} /> {active ? "Save edits" : "Save as experiment"}
              </button>
              {active?.status === "pending" && (
                <button className="btn accent sm" onClick={() => promote(active)}>
                  <Icon name="check" size={12} /> Promote to cookbook
                </button>
              )}
            </div>
          )}
        </div>

        <div className="lab-chat-body" ref={bodyRef}>
          {chat.length === 0 && (
            <div className="lab-empty">
              <div className="big">"Make me…"</div>
              <div>Describe the dish you're chasing, upload a photo of the ingredients you have, or try one of the prompts below.</div>
            </div>
          )}
          {chat.map((t, i) => (
            <div className={`lab-turn ${t.role}`} key={i}>
              {t.role === "ai" && <div className="av">A</div>}
              {t.draft ? (
                <div className="bubble recipe">
                  <LabRecipeCard draft={t.draft} />
                </div>
              ) : (
                <div>
                  {t.photos && t.photos.length > 0 && (
                    <div className="turn-photos">
                      {t.photos.map((p, pi) => (
                        <div key={pi} className="turn-photo" style={{ backgroundImage: `url(${p.url})` }} />
                      ))}
                    </div>
                  )}
                  <div className="bubble">{t.text}</div>
                </div>
              )}
              {t.role === "you" && <div className="av">Y</div>}
            </div>
          ))}
          {thinking && (
            <div className="lab-turn ai thinking">
              <div className="av">A</div>
              <div className="bubble">Drafting a recipe…</div>
            </div>
          )}
        </div>

        <div className="lab-input">
          {chat.length === 0 && (
            <div className="chips">
              {quickPrompts.map((p, i) => (
                <button key={i} className="chip" onClick={() => send(p)}>
                  <Icon name="sparkle" size={10} /> {p}
                </button>
              ))}
            </div>
          )}
          {chat.length > 0 && !thinking && (
            <div className="chips">
              <button className="chip" onClick={() => setText("Make it lighter / lower-fat.")}>Lighter</button>
              <button className="chip" onClick={() => setText("Make it gluten-free.")}>GF</button>
              <button className="chip" onClick={() => setText("Make it for a crowd of 12.")}>For 12</button>
              <button className="chip" onClick={() => setText("Cut the time in half.")}>Faster</button>
              <button className="chip" onClick={() => setText("Make it more interesting / less safe.")}>Bolder</button>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="lab-attachments">
              {attachments.map((a, i) => (
                <div key={i} className="lab-attachment" style={{ backgroundImage: `url(${a.url})` }}>
                  <button onClick={() => removeAttachment(i)} aria-label="Remove photo">
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
              <div className="lab-attachment-hint">
                <Icon name="sparkle" size={11} /> AI will read what you have and suggest a recipe.
              </div>
            </div>
          )}

          <div className="field">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.txt"
              multiple
              style={{ display: "none" }}
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />
            <textarea
              placeholder={chat.length === 0
                ? "e.g. \"Blueberry lemon poppy seed rolls\" — or snap your fridge"
                : "Ask the AI to refine — e.g. \"use cardamom instead of cinnamon\""
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
            />
            <div className="attach-wrap">
              <button
                className="btn ghost icon-only"
                onClick={() => setAttachMenu(o => !o)}
                title="Attach photo or file"
                aria-label="Attach"
                aria-expanded={attachMenu}
                type="button"
              >
                <Icon name="paperclip" size={16} />
              </button>
              {attachMenu && (
                <>
                  <div className="attach-menu-scrim" onClick={() => setAttachMenu(false)} />
                  <div className="attach-menu" role="menu">
                    <button
                      role="menuitem"
                      onClick={() => { setAttachMenu(false); cameraInputRef.current?.click(); }}
                    >
                      <Icon name="camera" size={15} />
                      <span>
                        <span className="t">Take a photo</span>
                        <span className="s">Use your device camera</span>
                      </span>
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setAttachMenu(false);
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = "image/*";
                          fileInputRef.current.click();
                          // reset accept after a tick
                          setTimeout(() => { if (fileInputRef.current) fileInputRef.current.accept = "image/*,application/pdf,.doc,.docx,.txt"; }, 200);
                        }
                      }}
                    >
                      <Icon name="image" size={15} />
                      <span>
                        <span className="t">Photo from device</span>
                        <span className="s">Pick from your library</span>
                      </span>
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setAttachMenu(false); fileInputRef.current?.click(); }}
                    >
                      <Icon name="file" size={15} />
                      <span>
                        <span className="t">Attach a file</span>
                        <span className="s">PDF, doc, recipe screenshot</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <button className="btn primary sm" onClick={() => send()} disabled={(!text.trim() && attachments.length === 0) || thinking}>
              <Icon name="sparkle" size={11} /> Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Renders a draft recipe inside a chat bubble
function LabRecipeCard({ draft }) {
  return (
    <div className="lab-recipe-card">
      <div className="head">
        <div className="ai-tag"><Icon name="sparkle" size={9} /> Draft recipe</div>
        <h4>{draft.title}</h4>
        <div className="sub">{draft.blurb}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <span className="recipe-tag time"><Icon name="clock" size={11} /> {fmtDuration(draft.time || 30)}</span>
          <span className="recipe-tag"><span className="dot" style={{ background: "var(--accent-2)" }} /> Serves {draft.servings || 4}</span>
        </div>
      </div>
      <div className="body">
        <div>
          <h5>Ingredients</h5>
          <ul>
            {draft.ingredients.map((i, idx) => (
              <li key={idx}>
                <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{formatQty(i.qty)} {i.unit}</span>{" "}
                {i.item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h5>Method</h5>
          <ol>
            {draft.steps.map((s, idx) => <li key={idx}>{s}</li>)}
          </ol>
        </div>
      </div>
      {draft.tips?.length > 0 && (
        <div className="actions">
          <span style={{ fontFamily: "var(--serif)", fontStyle: "italic" }}>
            💡 {draft.tips[0]}
          </span>
        </div>
      )}
    </div>
  );
}

