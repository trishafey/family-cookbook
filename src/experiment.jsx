// Kitchen Experimentation Lab — chat-based recipe discovery / drafting.
//
// Architecture:
//   • ExperimentationLab — the index page (grid of experiments + a
//     "New experiment" CTA). Loads from D1 via the lab API so the
//     cook's drafts follow them across devices.
//   • LabChat — full-page overlay opened by "New experiment" or
//     clicking an existing card. The chat used to live cramped
//     below the experiments grid; promoting it to a full screen
//     gave the cook real estate to type, scroll, and read drafts.
//
// Experiments persist on the server (lab_experiments table). User
// cooking preferences (user_prefs) ride along on every AI call so
// the cook doesn't have to re-state "I like things fruit-forward"
// every turn.

import { useState, useEffect, useRef, useMemo } from "react";
import { Icon, fmtDuration, formatIngredientQty } from "./helpers.jsx";

// Generates a fridge-inventory draft when photos are attached and
// the user hasn't signed in yet. Real vision flow is wired
// elsewhere — this is a friendly local fallback.
function generateFridgeDraft(photoCount, hint) {
  const h = (hint || "").toLowerCase();
  if (h.includes("dinner") || h.includes("tonight")) {
    return {
      title: "Pantry Skillet Dinner",
      blurb: `Built from what I can see across ${photoCount} ${photoCount === 1 ? "photo" : "photos"} — a one-pan dinner using what's already on hand.`,
      time: 35,
      servings: 4,
      ingredients: [
        { qty: 1, unit: "lb",  item: "protein I spotted (chicken thighs / sausage / tofu)", grp: "Main" },
        { qty: 1, unit: "",    item: "yellow onion, diced", grp: "Main" },
        { qty: 3, unit: "",    item: "garlic cloves", grp: "Main" },
        { qty: 1, unit: "can", item: "tomatoes (or 2 fresh, chopped)", grp: "Main" },
        { qty: 1, unit: "cup", item: "stock or water", grp: "Main" },
        { qty: 1, unit: "cup", item: "starch on hand (rice, pasta, beans)", grp: "Main" },
        { qty: 0, unit: "",    item: "olive oil, salt, pepper, whatever herb you have", grp: "To finish" },
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
      { qty: 2,  unit: "tbsp", item: "neutral oil", grp: "Stir-fry" },
      { qty: 4,  unit: "",     item: "garlic cloves, smashed", grp: "Stir-fry" },
      { qty: 1,  unit: "inch", item: "ginger, julienned", grp: "Stir-fry" },
      { qty: 12, unit: "oz",   item: "mixed vegetables I spotted", grp: "Stir-fry" },
      { qty: 8,  unit: "oz",   item: "protein on hand", grp: "Stir-fry" },
      { qty: 2,  unit: "tbsp", item: "soy sauce", grp: "Sauce" },
      { qty: 1,  unit: "tbsp", item: "rice vinegar or lemon juice", grp: "Sauce" },
      { qty: 1,  unit: "tsp",  item: "sesame oil to finish", grp: "Sauce" },
      { qty: 2,  unit: "cups", item: "cooked rice (or noodles)", grp: "Serve" },
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
  // cookbook (or in cook mode).
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
    ingredients: (draft.ingredients || []).map(i => ({ ...i, grp: i.grp || "Ingredients" })),
    steps: (draft.steps || []).map((d) => ({
      t: d.split(/[.:]/)[0].slice(0, 60),
      d, mins: Math.ceil((draft.time || 30) / draft.steps.length), precision: "medium",
    })),
    tips: draft.tips || [],
    comments: [],
    _experiment: true,
  };
}

// "Did you make this?" — replaces the older "Tasting note" affordance.
// Reads more naturally on the draft card: the AI asks the cook whether
// they cooked it; the cook says yes/no and leaves feedback that flows
// into the next iteration.
function CookedFeedback({ value, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);

  if (!value && !editing) {
    return (
      <button
        type="button"
        className="lab-tasting add"
        onClick={() => setEditing(true)}
        disabled={disabled}
        title={disabled ? "Sign in to leave feedback" : "Tell the AI how it turned out"}
      >
        <Icon name="sparkle" size={12} /> Did you make this?
      </button>
    );
  }
  if (editing) {
    return (
      <div className="lab-tasting editing">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="How did it turn out? Too sweet? Crumb was tight? Family loved it?"
        />
        <div className="actions">
          <button className="btn ghost sm" onClick={() => { setEditing(false); setText(value); }}>Cancel</button>
          <button className="btn primary sm" onClick={() => { onSave(text.trim()); setEditing(false); }}>Save</button>
        </div>
      </div>
    );
  }
  return (
    <div className="lab-tasting saved" onClick={() => !disabled && setEditing(true)}>
      <div className="head">
        <Icon name="bookmark" size={12} /> <span>You made this</span>
      </div>
      <div className="note">{value}</div>
    </div>
  );
}

// Cooking preferences bar — inline editor at the top of the chat
// overlay. The freeform note is sent with every AI call so the cook
// doesn't have to repeat "fruit-forward and jammy" on every prompt.
function PrefsBar({ value, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);

  if (!editing) {
    return (
      <div className="lab-prefs-bar">
        <div className="t">
          <Icon name="sparkle" size={12} />
          <span className="label">How you like to cook</span>
          <span className="val">{value || "Tell the AI your style — fruit-forward, lower-sugar, no shellfish…"}</span>
        </div>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setEditing(true)}
          disabled={disabled}
        >
          {value ? "Edit" : "Set"}
        </button>
      </div>
    );
  }
  return (
    <div className="lab-prefs-bar editing">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. I like things fruit-forward and jammy, with extra fruit and a soft crumb. Lower-sugar than most recipes call for. No shellfish."
      />
      <div className="actions">
        <button className="btn ghost sm" onClick={() => { setEditing(false); setText(value); }}>Cancel</button>
        <button className="btn primary sm" onClick={() => { onSave(text.trim()); setEditing(false); }}>Save</button>
      </div>
    </div>
  );
}

// Renders a draft recipe inside a chat bubble. Ingredients are
// grouped by .grp ("Dough", "Filling", "Glaze"). Includes a "Cook
// this" CTA that drops the draft into cook mode, and a "Copy
// ingredients" button that puts the shopping list on the clipboard.
function LabRecipeCard({ draft, onCookThis }) {
  const [copied, setCopied] = useState(false);

  const grouped = useMemo(() => {
    const byGrp = new Map();
    for (const ing of draft.ingredients || []) {
      const g = ing.grp || "Ingredients";
      if (!byGrp.has(g)) byGrp.set(g, []);
      byGrp.get(g).push(ing);
    }
    return [...byGrp.entries()];
  }, [draft.ingredients]);

  const copyIngredients = () => {
    const lines = [`${draft.title}`, `Serves ${draft.servings || 4}`, ""];
    for (const [grp, items] of grouped) {
      if (grouped.length > 1) lines.push(grp);
      for (const i of items) {
        lines.push(`  ${formatIngredientQty(i)} ${i.item}`.trim());
      }
      lines.push("");
    }
    const text = lines.join("\n").trim();
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="lab-recipe-card">
      <div className="head">
        <div className="ai-tag"><Icon name="sparkle" size={11} /> Draft recipe</div>
        <h4>{draft.title}</h4>
        <div className="sub">{draft.blurb}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <span className="recipe-tag time"><Icon name="clock" size={13} /> {fmtDuration(draft.time || 30)}</span>
          <span className="recipe-tag"><span className="dot" style={{ background: "var(--accent-2)" }} /> Serves {draft.servings || 4}</span>
        </div>
      </div>
      <div className="body">
        <div>
          <h5>Ingredients</h5>
          {grouped.map(([grp, items]) => (
            <div key={grp} className="lab-ing-group">
              {grouped.length > 1 && <div className="lab-ing-grp-head">{grp}</div>}
              <ul>
                {items.map((i, idx) => (
                  <li key={idx}>
                    <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{formatIngredientQty(i)}</span>{" "}
                    {i.item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div>
          <h5>Method</h5>
          <ol>
            {draft.steps.map((s, idx) => <li key={idx}>{s}</li>)}
          </ol>
        </div>
      </div>
      <div className="lab-recipe-actions">
        {onCookThis && (
          <button className="btn primary sm" onClick={() => onCookThis(draft)}>
            <Icon name="play" size={13} /> Cook this
          </button>
        )}
        <button className="btn sm" onClick={copyIngredients}>
          <Icon name={copied ? "check" : "copy"} size={13} /> {copied ? "Copied" : "Copy ingredients"}
        </button>
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

// Full-page chat overlay. Owns the chat array; on every change,
// debounced-saves the experiment server-side. authEmail's initial
// is shown in the user avatar bubble; AI avatar is the heirloom
// (tomato) icon.
function LabChat({
  experiment,             // existing experiment row, or null for new
  isNew,
  authEmail,
  cookPrefs,
  onClose,
  onPersist,              // (draftToSave, chatToSave, status?) → Promise<id>
  onPromote,              // (recipe) → void  — adds to cookbook
  onCookThis,             // (draft) → void  — open cook mode
}) {
  const [chat, setChat] = useState(experiment?.chat || []);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachMenu, setAttachMenu] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const bodyRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  // Initial chosen once on mount so a sign-out mid-conversation
  // doesn't flicker the bubble.
  const youInitial = useMemo(() => (authEmail?.[0] || "Y").toUpperCase(), [authEmail]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [chat, thinking, suggestions]);

  // Esc closes the overlay.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const previousDraftFromChat = (turns) => {
    for (let i = turns.length - 1; i >= 0; i--) if (turns[i].draft) return turns[i].draft;
    return null;
  };

  const latestDraft = useMemo(() => previousDraftFromChat(chat), [chat]);

  // Persist whenever the chat changes and we have a draft to anchor on.
  const lastSavedKey = useRef("");
  useEffect(() => {
    if (!latestDraft) return;
    const key = JSON.stringify({ d: latestDraft, c: chat.length });
    if (key === lastSavedKey.current) return;
    lastSavedKey.current = key;
    onPersist(latestDraft, chat);
  }, [chat, latestDraft, onPersist]);

  const send = async (q) => {
    const txt = (q ?? text).trim();
    const hasPhotos = attachments.length > 0;
    if (!txt && !hasPhotos) return;

    setSendError(null);
    setSuggestions(null);

    const youTurn = { role: "you", text: txt || "(here's what's in my fridge)", photos: attachments };
    const nextChat = [...chat, youTurn];
    setChat(nextChat);
    setText("");
    setAttachments([]);
    setThinking(true);

    if (hasPhotos) {
      setTimeout(() => {
        const draft = generateFridgeDraft(attachments.length, txt);
        const aiTurn = {
          role: "ai",
          text: `Looking at the ${attachments.length === 1 ? "photo" : `${attachments.length} photos`}, here's what I'd make with what you've got. Tell me what to swap or build around.`,
          draft,
          diff: "Initial draft",
          greeting: "Photo iteration — text follow-ups go through the AI.",
        };
        setChat([...nextChat, aiTurn]);
        setThinking(false);
      }, 1100);
      return;
    }

    if (!authEmail) {
      setSendError("Sign in to iterate with the AI.");
      setThinking(false);
      setChat(chat);
      setText(txt);
      return;
    }

    try {
      const res = await fetch("/api/admin/ai/lab-iterate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          prompt: txt,
          previousDraft: previousDraftFromChat(chat),
          history: chat,
          cookPrefs,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || `Lab iteration failed (${res.status})`);
      }
      const { draft, diff, greeting } = await res.json();
      const aiTurn = { role: "ai", text: greeting, draft, diff, greeting };
      setChat([...nextChat, aiTurn]);
    } catch (err) {
      setSendError(err.message || "Could not reach the kitchen AI.");
      setChat(chat);
      setText(txt);
    } finally {
      setThinking(false);
    }
  };

  const setCookedFeedback = (i, note) => {
    setChat(prev => prev.map((t, idx) => idx === i ? { ...t, tastingNote: note } : t));
  };

  const tastingNotesForAI = () => chat
    .filter(t => t.role === "ai" && t.draft && t.tastingNote)
    .map(t => ({ draftTitle: t.draft.title, note: t.tastingNote }));

  const suggestNext = async () => {
    if (!authEmail) { setSendError("Sign in to ask for suggestions."); return; }
    if (!latestDraft) return;
    setSuggesting(true);
    setSendError(null);
    try {
      const res = await fetch("/api/admin/ai/lab-suggest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ latestDraft, tastingNotes: tastingNotesForAI(), cookPrefs }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || `Suggest failed (${res.status})`);
      }
      const { suggestions: list } = await res.json();
      setSuggestions(list || []);
    } catch (err) {
      setSendError(err.message || "Could not reach the kitchen AI.");
    } finally {
      setSuggesting(false);
    }
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

  const quickPrompts = [
    "Blueberry lemon poppy seed rolls",
    "A dessert with pears and dark chocolate",
    "30-minute pantry ramen",
    "Brunch dish using leftover roast beef",
    "Vegetarian Sunday dinner the kids will eat",
  ];

  const promote = () => {
    if (!latestDraft) return;
    onPromote(draftToRecipe(latestDraft, "promoted"));
  };

  return (
    <div className="lab-overlay" role="dialog" aria-label="Experimentation Lab chat">
      <div className="lab-overlay-head">
        <button className="btn ghost" onClick={onClose} aria-label="Close chat">
          <Icon name="chevL" /> Back to the Lab
        </button>
        <div className="title-block">
          <div className="label">{isNew && !latestDraft ? "New experiment" : "Working on"}</div>
          {(experiment?.title || latestDraft?.title) && (
            <h3>{experiment?.title || latestDraft?.title}</h3>
          )}
        </div>
        <div className="actions">
          {latestDraft && (
            <>
              <button
                className="btn ghost ai sm"
                onClick={suggestNext}
                disabled={suggesting || !authEmail}
                aria-busy={suggesting}
                title="Ask the AI what to try next"
              >
                <Icon name="sparkle" size={13} /> {suggesting ? "Thinking…" : "What to try next"}
              </button>
              {experiment?.status !== "promoted" && (
                <button className="btn accent sm" onClick={promote}>
                  <Icon name="check" size={14} /> Promote to cookbook
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {sendError && (
        <div className="lab-error">{sendError}</div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="lab-suggestions">
          <div className="head">
            <span className="label">What to try next</span>
            <button className="dismiss" onClick={() => setSuggestions(null)} aria-label="Dismiss suggestions">
              <Icon name="x" size={13} />
            </button>
          </div>
          <div className="cards">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="card"
                onClick={() => { setSuggestions(null); send(s.prompt); }}
                title={s.why}
              >
                <div className="label"><Icon name="sparkle" size={12} /> {s.label}</div>
                <div className="why">{s.why}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="lab-chat-body" ref={bodyRef}>
        {chat.length === 0 && (
          <div className="lab-empty">
            <div className="big">"Make me…"</div>
            <div>Describe the dish you're chasing, upload a photo of the ingredients you have, or try one of the prompts below.</div>
          </div>
        )}
        {chat.map((t, i) => (
          <div className={`lab-turn ${t.role}`} key={i}>
            {t.role === "ai" && (
              <div className="av ai-av" aria-hidden>
                <Icon name="heirloom" size={20} />
              </div>
            )}
            {t.draft ? (
              <div className="bubble recipe">
                {t.diff && (
                  <div className="lab-diff">
                    <Icon name="sparkle" size={11} />
                    <span>{t.diff}</span>
                  </div>
                )}
                <LabRecipeCard draft={t.draft} onCookThis={onCookThis} />
                {t.greeting && <div className="lab-greeting">{t.greeting}</div>}
                <CookedFeedback
                  value={t.tastingNote || ""}
                  onSave={(note) => setCookedFeedback(i, note)}
                  disabled={!authEmail}
                />
              </div>
            ) : (
              <div className="lab-turn-content">
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
            {t.role === "you" && (
              <div className="av you-av" aria-hidden>{youInitial}</div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="lab-turn ai thinking">
            <div className="av ai-av" aria-hidden><Icon name="heirloom" size={20} /></div>
            <div className="bubble">Drafting a recipe…</div>
          </div>
        )}
      </div>

      <div className="lab-input">
        {chat.length === 0 && (
          <div className="chips">
            {quickPrompts.map((p, i) => (
              <button key={i} className="chip" onClick={() => send(p)}>
                <Icon name="sparkle" size={12} /> {p}
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
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
            <div className="lab-attachment-hint">
              <Icon name="sparkle" size={13} /> AI will read what you have and suggest a recipe.
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
              ? "e.g. \"Strawberry rhubarb muffins, fruit-forward\" — or snap your fridge"
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
                  <button role="menuitem" onClick={() => { setAttachMenu(false); cameraInputRef.current?.click(); }}>
                    <Icon name="camera" size={17} />
                    <span><span className="t">Take a photo</span><span className="s">Use your device camera</span></span>
                  </button>
                  <button role="menuitem" onClick={() => { setAttachMenu(false); fileInputRef.current?.click(); }}>
                    <Icon name="file" size={17} />
                    <span><span className="t">Attach a file</span><span className="s">PDF, doc, recipe screenshot</span></span>
                  </button>
                </div>
              </>
            )}
          </div>
          <button className="btn primary sm" onClick={() => send()} disabled={(!text.trim() && attachments.length === 0) || thinking}>
            <Icon name="sparkle" size={13} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ExperimentationLab — the index page
// ─────────────────────────────────────────────────────────────
export function ExperimentationLab({ onClose, onPromote, openCook, allRecipes, authEmail }) {
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null); // null | "__new__" | { ...experiment }
  const [cookPrefs, setCookPrefs] = useState("");
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!authEmail) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const [expsRes, prefsRes] = await Promise.all([
          fetch("/api/admin/lab/experiments", { credentials: "include" }),
          fetch("/api/admin/me/prefs",         { credentials: "include" }),
        ]);
        const exps  = expsRes.ok  ? await expsRes.json()  : { experiments: [] };
        const prefs = prefsRes.ok ? await prefsRes.json() : { cookPrefs: "" };
        if (cancelled) return;
        setExperiments(exps.experiments || []);
        setCookPrefs(prefs.cookPrefs || "");
      } catch (err) {
        if (!cancelled) setLoadError("Could not load your experiments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authEmail]);

  const savePrefs = async (text) => {
    setCookPrefs(text);
    if (!authEmail) return;
    try {
      await fetch("/api/admin/me/prefs", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookPrefs: text }),
      });
    } catch {}
  };

  // Persist a chat update for the open experiment. Creates a row
  // on first save for new experiments, then updates that row on
  // subsequent ticks.
  const persistActive = async (draft, chat) => {
    if (!authEmail) return;
    if (!active) return;
    if (active === "__new__") {
      try {
        const res = await fetch("/api/admin/lab/experiments", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft, chat }),
        });
        if (!res.ok) return;
        const { id, createdAt, updatedAt } = await res.json();
        const newExp = { id, title: draft.title, blurb: draft.blurb || "", status: "pending", draft, chat, createdAt, updatedAt };
        setExperiments(prev => [newExp, ...prev]);
        setActive(newExp);
      } catch {}
      return;
    }
    try {
      const res = await fetch(`/api/admin/lab/experiments/${active.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, chat }),
      });
      if (!res.ok) return;
      const { updatedAt } = await res.json();
      const updated = { ...active, title: draft.title, blurb: draft.blurb || "", draft, chat, updatedAt };
      setActive(updated);
      setExperiments(prev => prev.map(e => e.id === active.id ? updated : e));
    } catch {}
  };

  const promoteActive = async (recipe) => {
    onPromote(recipe);
    if (active && active !== "__new__") {
      try {
        await fetch(`/api/admin/lab/experiments/${active.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "promoted" }),
        });
        const updated = { ...active, status: "promoted" };
        setActive(updated);
        setExperiments(prev => prev.map(e => e.id === active.id ? updated : e));
      } catch {}
    }
  };

  const remove = async (id) => {
    setExperiments(prev => prev.filter(e => e.id !== id));
    if (active && active.id === id) setActive(null);
    if (!authEmail) return;
    try {
      await fetch(`/api/admin/lab/experiments/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {}
  };

  const cookThis = (draft) => {
    const recipe = draftToRecipe(draft);
    const ings = recipe.ingredients;
    if (openCook) openCook(recipe, recipe.steps, ings);
  };

  if (active) {
    const isNew = active === "__new__";
    return (
      <LabChat
        experiment={isNew ? null : active}
        isNew={isNew}
        authEmail={authEmail}
        cookPrefs={cookPrefs}
        onClose={() => setActive(null)}
        onPersist={persistActive}
        onPromote={promoteActive}
        onCookThis={cookThis}
      />
    );
  }

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
          <button className="btn primary" onClick={() => setActive("__new__")}>
            <Icon name="plus" /> New experiment
          </button>
        </div>
      </div>

      <PrefsBar value={cookPrefs} onSave={savePrefs} disabled={!authEmail} />

      {loadError && <div className="lab-error" style={{ marginTop: 16 }}>{loadError}</div>}

      {loading ? (
        <div style={{ marginTop: 32, color: "var(--ink-3)" }}>Loading your experiments…</div>
      ) : experiments.length === 0 ? (
        <div className="lab-empty-index">
          <p>No experiments yet. Hit <em>New experiment</em> to start iterating with the AI.</p>
        </div>
      ) : (
        <>
          <div className="eyebrow" style={{ marginBottom: 12, marginTop: 24 }}>Your experiments</div>
          <div className="lab-experiments-row">
            {experiments.map(e => (
              <div
                key={e.id}
                className={`experiment-card`}
                onClick={() => setActive(e)}
              >
                <span className={`status ${e.status}`}>
                  {e.status === "pending" ? "Pending trial" : "In the cookbook"}
                </span>
                <div className="name">{e.title}</div>
                <div className="blurb">{e.blurb}</div>
                <div className="meta">
                  <span>{(e.draft?.steps?.length || 0)} steps · {fmtDuration(e.draft?.time || 30)}</span>
                  <span>{new Date(e.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    className="btn ghost sm"
                    onClick={(ev) => { ev.stopPropagation(); setActive(e); }}
                  >
                    <Icon name="sparkle" size={13} /> Open chat
                  </button>
                  <button
                    className="btn ghost sm"
                    onClick={(ev) => { ev.stopPropagation(); remove(e.id); }}
                    title="Discard"
                    aria-label="Discard experiment"
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
