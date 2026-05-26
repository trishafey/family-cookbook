// Pairings — "Goes great with…" section at the bottom of recipe pages.
// Two kinds of tiles:
//   1. Cookbook recipes (other entries in the family book)
//   2. AI-suggested companions ("new suggestion" tag) — sauces, sides,
//      drinks, accompaniments that aren't yet in the book. Clicking opens
//      a quick recipe modal that the user can "make" or save to the book.

const { useState } = React;

// ─────────────────────────────────────────────────────────────
// Pairings data
// ─────────────────────────────────────────────────────────────
const PAIRINGS = {
  "prime-rib": {
    recipes: ["grandma-biscuits"],
    suggestions: [
      {
        title: "Horseradish cream sauce",
        kind: "Sauce",
        blurb: "Cool, sharp counterpoint to the roast. Whips up in 5 minutes.",
        time: 5,
        ingredients: [
          { qty: 1,   unit: "cup",  item: "sour cream" },
          { qty: 3,   unit: "tbsp", item: "prepared horseradish, drained" },
          { qty: 1,   unit: "tsp",  item: "Dijon mustard" },
          { qty: 1,   unit: "tsp",  item: "lemon juice" },
          { qty: 1,   unit: "pinch",item: "fine sea salt" },
          { qty: 2,   unit: "tbsp", item: "chives, minced (optional)" },
        ],
        steps: [
          "Whisk everything in a small bowl until smooth.",
          "Taste — adjust salt and lemon. It should be sharp but creamy.",
          "Chill at least 30 minutes before serving. Better the next day.",
        ],
        photoTone: "#d6d2c4",
      },
      {
        title: "Quick beef au jus",
        kind: "Sauce",
        blurb: "Use the pan fond + good stock for a thin, beefy dipping jus.",
        time: 15,
        ingredients: [
          { qty: 2,   unit: "cups", item: "low-sodium beef stock" },
          { qty: 0.5, unit: "cup",  item: "dry red wine" },
          { qty: 1,   unit: "tbsp", item: "tomato paste" },
          { qty: 1,   unit: "",     item: "thyme sprig" },
          { qty: 0,   unit: "",     item: "salt + pepper, to taste" },
        ],
        steps: [
          "After pulling the roast, set the pan over medium heat.",
          "Add wine, scrape the fond. Reduce by half.",
          "Add stock + tomato paste + thyme. Simmer 8 minutes.",
          "Strain. Season. Serve in a small pitcher.",
        ],
        photoTone: "#6b3a1a",
      },
      {
        title: "Roasted root vegetables",
        kind: "Side",
        blurb: "Carrots, parsnips, shallots — roast on a sheet pan while the beef rests.",
        time: 35,
        ingredients: [
          { qty: 1,  unit: "lb",   item: "carrots, halved lengthwise" },
          { qty: 1,  unit: "lb",   item: "parsnips, halved lengthwise" },
          { qty: 8,  unit: "",     item: "small shallots, peeled" },
          { qty: 3,  unit: "tbsp", item: "olive oil" },
          { qty: 1,  unit: "tbsp", item: "flaky salt" },
          { qty: 4,  unit: "",     item: "thyme sprigs" },
        ],
        steps: [
          "425°F oven. Toss vegetables with oil, salt, thyme.",
          "Spread on a sheet pan in a single layer.",
          "Roast 30–35 min, flipping once, until deeply caramelized.",
        ],
        photoTone: "#c08a3a",
      },
      {
        title: "Yorkshire pudding",
        kind: "Side",
        blurb: "Crisp, hollow popovers cooked in the drippings. Tradition.",
        time: 30,
        ingredients: [
          { qty: 1,    unit: "cup", item: "all-purpose flour" },
          { qty: 1,    unit: "cup", item: "whole milk" },
          { qty: 4,    unit: "",    item: "large eggs" },
          { qty: 0.5,  unit: "tsp", item: "kosher salt" },
          { qty: 4,    unit: "tbsp",item: "beef drippings (or duck fat)" },
        ],
        steps: [
          "Whisk eggs + milk. Whisk in flour + salt until smooth. Rest 30 min.",
          "Get a muffin tin ripping hot at 450°F with drippings in each cup.",
          "Pour batter halfway. Bake 18 min — DO NOT OPEN THE OVEN.",
          "Serve immediately.",
        ],
        photoTone: "#c8a070",
      },
    ],
  },
  "linguine-vongole": {
    recipes: ["olive-oil-cake"],
    suggestions: [
      {
        title: "Garlic crostini",
        kind: "Side",
        blurb: "For the inevitable sauce-mopping at the bottom of the bowl.",
        time: 10,
        ingredients: [
          { qty: 1,   unit: "",    item: "baguette, sliced ½-inch thick" },
          { qty: 3,   unit: "tbsp",item: "olive oil" },
          { qty: 2,   unit: "",    item: "garlic cloves, halved" },
          { qty: 0,   unit: "",    item: "flaky salt" },
        ],
        steps: [
          "Brush bread with oil. Toast under the broiler until deeply golden.",
          "Rub the warm slices with the cut side of the garlic.",
          "Salt while still hot.",
        ],
        photoTone: "#b58c5a",
      },
      {
        title: "Lemony arugula salad",
        kind: "Salad",
        blurb: "Sharp, peppery counterweight to the rich sauce.",
        time: 5,
        ingredients: [
          { qty: 5,    unit: "oz",  item: "baby arugula" },
          { qty: 2,    unit: "tbsp",item: "olive oil" },
          { qty: 0.5,  unit: "",    item: "lemon, juiced" },
          { qty: 0.25, unit: "cup", item: "shaved Parmesan" },
          { qty: 0,    unit: "",    item: "salt + pepper" },
        ],
        steps: [
          "Whisk olive oil + lemon juice with a pinch of salt.",
          "Toss with arugula. Top with Parm.",
        ],
        photoTone: "#7a8a3a",
      },
      {
        title: "Whipped ricotta with honey",
        kind: "Dessert",
        blurb: "Sweet whisper after a salty, briny dinner.",
        time: 5,
        ingredients: [
          { qty: 1,    unit: "cup",  item: "whole-milk ricotta" },
          { qty: 2,    unit: "tbsp", item: "good honey" },
          { qty: 0.5,  unit: "tsp",  item: "vanilla" },
          { qty: 1,    unit: "pinch",item: "flaky salt" },
        ],
        steps: [
          "Whip ricotta with a whisk until smooth and airy.",
          "Drizzle with honey, vanilla, salt. Serve with biscotti.",
        ],
        photoTone: "#e8d8b0",
      },
    ],
  },
  "blueberry-lemon-rolls": {
    recipes: [],
    suggestions: [
      {
        title: "Vanilla cream cheese drizzle",
        kind: "Topping",
        blurb: "Optional, but: gilding the lily is allowed at brunch.",
        time: 4,
        ingredients: [
          { qty: 4,    unit: "oz",  item: "cream cheese, softened" },
          { qty: 0.5,  unit: "cup", item: "powdered sugar" },
          { qty: 2,    unit: "tbsp",item: "whole milk" },
          { qty: 1,    unit: "tsp", item: "vanilla" },
        ],
        steps: [
          "Whisk cream cheese smooth.",
          "Whisk in sugar, milk, vanilla. Should be pourable but not runny.",
          "Drizzle over warm rolls (under or instead of the lemon glaze).",
        ],
        photoTone: "#fbf2e8",
      },
      {
        title: "Strong drip coffee",
        kind: "Drink",
        blurb: "The right counterweight. Use whole beans, ground that morning.",
        time: 6,
        ingredients: [
          { qty: 35, unit: "g",   item: "fresh whole beans (medium-dark roast)" },
          { qty: 500,unit: "ml",  item: "filtered water, just off boil" },
        ],
        steps: [
          "Grind beans on a medium setting (table salt).",
          "Pour-over: bloom 45 sec with 80g water, then pour in 3 passes.",
          "Total brew time ~3:30.",
        ],
        photoTone: "#3a2a1a",
      },
    ],
  },
  "nonnas-lasagna": {
    recipes: ["olive-oil-cake"],
    suggestions: [
      {
        title: "Caesar salad",
        kind: "Salad",
        blurb: "Anchovy + lemon to cut the richness. Make the dressing from scratch.",
        time: 12,
        ingredients: [
          { qty: 2,    unit: "",    item: "anchovy fillets, mashed" },
          { qty: 1,    unit: "",    item: "garlic clove, grated" },
          { qty: 1,    unit: "",    item: "egg yolk" },
          { qty: 0.5,  unit: "",    item: "lemon, juiced" },
          { qty: 0.5,  unit: "cup", item: "olive oil" },
          { qty: 0.5,  unit: "cup", item: "Parmesan, grated" },
          { qty: 1,    unit: "head",item: "romaine, chopped" },
        ],
        steps: [
          "Whisk anchovies, garlic, yolk, lemon.",
          "Stream in olive oil while whisking until emulsified.",
          "Toss with romaine + Parm. Top with more Parm.",
        ],
        photoTone: "#8a9a3a",
      },
      {
        title: "Garlic bread (the proper way)",
        kind: "Side",
        blurb: "Split loaf, garlic compound butter, broil to crisp.",
        time: 12,
        ingredients: [
          { qty: 1,   unit: "",     item: "ciabatta loaf, split lengthwise" },
          { qty: 6,   unit: "tbsp", item: "butter, softened" },
          { qty: 4,   unit: "",     item: "garlic cloves, minced" },
          { qty: 2,   unit: "tbsp", item: "flat-leaf parsley, chopped" },
          { qty: 0.25,unit: "tsp",  item: "kosher salt" },
        ],
        steps: [
          "Mash butter, garlic, parsley, salt together.",
          "Spread thickly over cut sides.",
          "Broil 4 minutes, watching like a hawk.",
        ],
        photoTone: "#b58c5a",
      },
    ],
  },
  "grandma-biscuits": {
    recipes: [],
    suggestions: [
      {
        title: "Sausage gravy",
        kind: "Sauce",
        blurb: "The biscuit's natural habitat. White, peppery, glossy.",
        time: 15,
        ingredients: [
          { qty: 1,    unit: "lb",   item: "breakfast sausage, casings off" },
          { qty: 3,    unit: "tbsp", item: "all-purpose flour" },
          { qty: 3,    unit: "cups", item: "whole milk, warm" },
          { qty: 1,    unit: "tsp",  item: "freshly cracked black pepper" },
          { qty: 0.5,  unit: "tsp",  item: "kosher salt" },
        ],
        steps: [
          "Brown sausage hard in a large skillet, breaking it up.",
          "Sprinkle flour over the fat. Stir 1 minute.",
          "Whisk in warm milk slowly. Simmer until thick — 5 min.",
          "Black pepper, salt. Ladle over split warm biscuits.",
        ],
        photoTone: "#f4ead8",
      },
      {
        title: "Quick strawberry jam",
        kind: "Topping",
        blurb: "Fresh berries, 20 minutes, no pectin.",
        time: 20,
        ingredients: [
          { qty: 1,   unit: "lb",   item: "strawberries, hulled" },
          { qty: 0.5, unit: "cup",  item: "sugar" },
          { qty: 1,   unit: "tbsp", item: "lemon juice" },
        ],
        steps: [
          "Mash berries lightly. Combine with sugar + lemon.",
          "Simmer over medium 15–18 min until thick. Skim foam.",
          "Cool — it'll thicken further.",
        ],
        photoTone: "#b03a3a",
      },
    ],
  },
  "dads-chili": {
    recipes: ["grandma-biscuits"],
    suggestions: [
      {
        title: "Skillet cornbread",
        kind: "Side",
        blurb: "Crispy edges, soft center. Cast iron only.",
        time: 30,
        ingredients: [
          { qty: 1,   unit: "cup",  item: "yellow cornmeal" },
          { qty: 1,   unit: "cup",  item: "all-purpose flour" },
          { qty: 0.25,unit: "cup",  item: "sugar" },
          { qty: 1,   unit: "tbsp", item: "baking powder" },
          { qty: 0.75,unit: "tsp",  item: "kosher salt" },
          { qty: 1,   unit: "cup",  item: "buttermilk" },
          { qty: 2,   unit: "",     item: "large eggs" },
          { qty: 6,   unit: "tbsp", item: "butter, melted" },
        ],
        steps: [
          "425°F. Preheat a 10\" cast iron skillet with 2 tbsp butter.",
          "Whisk dry. Whisk wet (minus pan butter). Combine.",
          "Pour batter into the hot skillet. Bake 22–25 min.",
        ],
        photoTone: "#d8b85a",
      },
      {
        title: "Quick-pickled jalapeños",
        kind: "Garnish",
        blurb: "Bright, vinegary crunch on top of every bowl.",
        time: 10,
        ingredients: [
          { qty: 6,    unit: "",     item: "jalapeños, sliced thin" },
          { qty: 0.5,  unit: "cup",  item: "white wine vinegar" },
          { qty: 0.5,  unit: "cup",  item: "water" },
          { qty: 1,    unit: "tbsp", item: "sugar" },
          { qty: 1,    unit: "tsp",  item: "kosher salt" },
        ],
        steps: [
          "Bring vinegar, water, sugar, salt to a simmer.",
          "Pour over the sliced jalapeños in a jar.",
          "Cool to room temp. Ready in 30 min, better the next day.",
        ],
        photoTone: "#7a9a3a",
      },
    ],
  },
  "sunday-roast-chicken": {
    recipes: ["grandma-biscuits"],
    suggestions: [
      {
        title: "Pan gravy",
        kind: "Sauce",
        blurb: "Don't let the drippings die in vain.",
        time: 10,
        ingredients: [
          { qty: 3,   unit: "tbsp", item: "pan drippings + 1 tbsp butter if needed" },
          { qty: 3,   unit: "tbsp", item: "all-purpose flour" },
          { qty: 2,   unit: "cups", item: "chicken stock, warm" },
          { qty: 0,   unit: "",     item: "salt + pepper" },
        ],
        steps: [
          "After roast comes out, pour off most fat, leaving ~3 tbsp + fond.",
          "Whisk in flour. Cook 1 minute over medium.",
          "Slowly whisk in warm stock. Simmer 5 minutes until thickened.",
          "Strain if you want it silky. Season.",
        ],
        photoTone: "#a87a3a",
      },
    ],
  },
  "scallion-pancakes": {
    recipes: [],
    suggestions: [
      {
        title: "Soy-vinegar dipping sauce",
        kind: "Sauce",
        blurb: "The classic three-ingredient dip. Mandatory.",
        time: 3,
        ingredients: [
          { qty: 3,   unit: "tbsp", item: "soy sauce" },
          { qty: 2,   unit: "tbsp", item: "Chinese black vinegar (Chinkiang)" },
          { qty: 1,   unit: "tsp",  item: "chili crisp or sesame oil" },
          { qty: 1,   unit: "tsp",  item: "thinly sliced scallion" },
        ],
        steps: ["Stir everything in a small bowl. Done."],
        photoTone: "#3a2a1a",
      },
    ],
  },
  "olive-oil-cake": {
    recipes: [],
    suggestions: [
      {
        title: "Whipped mascarpone",
        kind: "Topping",
        blurb: "Loose, cold, sweetened just barely. Spoon over a warm slice.",
        time: 4,
        ingredients: [
          { qty: 1,   unit: "cup",  item: "mascarpone" },
          { qty: 2,   unit: "tbsp", item: "powdered sugar" },
          { qty: 0.5, unit: "cup",  item: "heavy cream, cold" },
          { qty: 0.5, unit: "tsp",  item: "vanilla" },
        ],
        steps: [
          "Whip mascarpone smooth.",
          "Whip cream + sugar + vanilla to soft peaks separately.",
          "Fold the two together. Don't over-whip.",
        ],
        photoTone: "#f4ead8",
      },
    ],
  },
};

function pairingsFor(recipeId) {
  return PAIRINGS[recipeId] || { recipes: [], suggestions: [] };
}

// ─────────────────────────────────────────────────────────────
// PairingsSection — bottom of recipe page
// ─────────────────────────────────────────────────────────────
function PairingsSection({ recipe, allRecipes, openRecipe, onSaveRecipe, onSaveToLab }) {
  const { recipes: recIds, suggestions } = pairingsFor(recipe.id);
  const pairedRecipes = recIds.map(id => allRecipes.find(r => r.id === id)).filter(Boolean);

  const [activeSugg, setActiveSugg] = useState(null);

  if (pairedRecipes.length === 0 && suggestions.length === 0) return null;

  return (
    <>
      <div className="section-break">
        <span className="label">Goes great with</span>
      </div>

      <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-3)", marginBottom: 24, fontSize: 16 }}>
        AI-curated pairings — from the cookbook and new suggestions to round out the meal.
      </div>

      <div className="pairings-grid">
        {pairedRecipes.map(r => (
          <div key={r.id} className="pairing-tile from-book" onClick={() => openRecipe(r)}>
            <div className="photo" style={{ backgroundImage: `url(${r.photo})` }}>
              <div className="ribbon">In the cookbook</div>
            </div>
            <div className="body">
              <div className="kind">{r.course} · by {r.author}</div>
              <div className="title">{r.title}</div>
              <div className="blurb">{r.subtitle}</div>
              <div className="footer">
                <span className="mono">{fmtDuration(r.total)}</span>
                <span className="open-arrow">Open →</span>
              </div>
            </div>
          </div>
        ))}

        {suggestions.map((s, i) => (
          <div key={i} className="pairing-tile suggestion" onClick={() => setActiveSugg(s)}>
            <div className="photo" style={{ background: `linear-gradient(135deg, ${s.photoTone}, ${s.photoTone}cc)` }}>
              <div className="ribbon ai"><Icon name="sparkle" size={9} /> New suggestion</div>
              <div className="suggestion-mark">{s.title.split(" ").slice(0, 1).map(w => w[0]).join("")}</div>
            </div>
            <div className="body">
              <div className="kind">{s.kind} · AI</div>
              <div className="title">{s.title}</div>
              <div className="blurb">{s.blurb}</div>
              <div className="footer">
                <span className="mono">{fmtDuration(s.time)}</span>
                <span className="open-arrow">Take a look →</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <PairingSuggestionModal
        suggestion={activeSugg}
        forRecipe={recipe}
        onClose={() => setActiveSugg(null)}
        onSaveRecipe={onSaveRecipe}
        onSaveToLab={onSaveToLab}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// PairingSuggestionModal — quick look at an AI companion recipe.
// User can mark "I made it" and then optionally save to the cookbook.
// ─────────────────────────────────────────────────────────────
function PairingSuggestionModal({ suggestion, forRecipe, onClose, onSaveRecipe, onSaveToLab }) {
  const [made, setMade] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(null); // "cookbook" | "lab" | null

  if (!suggestion) return null;

  const sendToLab = () => {
    onSaveToLab?.({
      title: suggestion.title,
      blurb: suggestion.blurb,
      time: suggestion.time,
      servings: 4,
      ingredients: suggestion.ingredients,
      steps: suggestion.steps,
      tips: [`Pairing suggestion to test alongside ${forRecipe.title}.`],
    });
    setSavedFeedback("lab");
    setTimeout(() => onClose(), 1400);
  };

  const saveToCookbook = () => {
    const draft = {
      id: `pairing-${Date.now()}`,
      title: suggestion.title,
      subtitle: suggestion.blurb,
      author: "Kitchen AI · for " + forRecipe.title,
      cuisine: forRecipe.cuisine,
      course: suggestion.kind === "Dessert" ? "Dessert" : (suggestion.kind === "Sauce" || suggestion.kind === "Topping" || suggestion.kind === "Garnish") ? "Snack" : "Side",
      diet: [],
      occasion: forRecipe.occasion,
      photo: `https://images.unsplash.com/photo-1547573854-74d2a71d0826?w=1200&q=80`,
      photoTone: suggestion.photoTone || "#aaa",
      favorite: false,
      rating: 0,
      cookCount: 0,
      servingsDefault: 8,
      prep: 5, cook: suggestion.time, total: suggestion.time,
      difficulty: "Easy",
      nutrition: { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 },
      ingredients: suggestion.ingredients.map(i => ({ ...i, grp: "Ingredients" })),
      steps: suggestion.steps.map((d, idx) => ({
        t: d.split(/[.:]/)[0].slice(0, 60),
        d, mins: Math.ceil(suggestion.time / suggestion.steps.length), precision: "easy",
      })),
      tips: [`Paired with ${forRecipe.title} — kept the original recipe in mind.`],
      comments: [],
    };
    onSaveRecipe(draft);
    setSavedFeedback("cookbook");
    setTimeout(() => onClose(), 1200);
  };

  return (
    <Modal
      open={!!suggestion}
      onClose={onClose}
      title={suggestion.title}
      subtitle={
        <>
          <span className="ai-sparkle"><Icon name="sparkle" size={11} /> Kitchen AI suggestion</span>
          {" · "}{suggestion.kind} for {forRecipe.title}
        </>
      }
      size="lg"
      footer={
        savedFeedback ? (
          <>
            <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--accent-2)" }}>
              <Icon name="check" size={12} />{" "}
              {savedFeedback === "cookbook"
                ? "Added to the cookbook — find it on the home page."
                : "Saved to The Lab — iterate on it whenever you're ready."}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {made
                ? "Liked how it turned out? Add it to the cookbook — or send it to The Lab to keep iterating."
                : "Send to The Lab to tinker, or try it once and decide."}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {!made ? (
                <>
                  <button className="btn ghost" onClick={sendToLab}>
                    <Icon name="sparkle" size={12} /> Send to The Lab
                  </button>
                  <button className="btn primary" onClick={() => setMade(true)}>
                    <Icon name="check" size={12} /> I made it
                  </button>
                </>
              ) : (
                <>
                  <button className="btn ghost" onClick={sendToLab}>
                    <Icon name="sparkle" size={12} /> Send to The Lab
                  </button>
                  <button className="btn" onClick={onClose}>Not worthy</button>
                  <button className="btn accent" onClick={saveToCookbook}>
                    <Icon name="bookmark" size={12} /> Save to cookbook
                  </button>
                </>
              )}
            </div>
          </>
        )
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
        <div>
          <div style={{ aspectRatio: "4/3", background: `linear-gradient(135deg, ${suggestion.photoTone}, ${suggestion.photoTone}cc)`, borderRadius: "var(--radius-lg)", marginBottom: 16, display: "grid", placeItems: "center" }}>
            <div style={{ fontSize: 64, color: "rgba(255,255,255,.5)", fontFamily: "var(--serif)", fontStyle: "italic" }}>
              {suggestion.title[0]}
            </div>
          </div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.5 }}>
            {suggestion.blurb}
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="recipe-tag time"><Icon name="clock" size={11} /> {fmtDuration(suggestion.time)}</span>
            <span className="recipe-tag diff"><span className="dot" /> Easy</span>
            <span className="recipe-tag"><span className="dot" style={{ background: "var(--accent-2)" }} /> {suggestion.kind}</span>
          </div>
        </div>

        <div>
          <h4 style={{ marginBottom: 10 }}>Ingredients</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: 22 }}>
            {suggestion.ingredients.map((i, idx) => (
              <li key={idx} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 10, padding: "5px 0", borderBottom: "1px dotted var(--rule)", fontSize: 13.5 }}>
                <span className="mono" style={{ color: "var(--accent)" }}>{formatQty(i.qty)} {i.unit}</span>
                <span style={{ color: "var(--ink-2)" }}>{i.item}</span>
              </li>
            ))}
          </ul>
          <h4 style={{ marginBottom: 10 }}>Method</h4>
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            {suggestion.steps.map((s, idx) => (
              <li key={idx} style={{ padding: "5px 0", fontFamily: "var(--serif)", fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{s}</li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

Object.assign(window, { PairingsSection, PAIRINGS, pairingsFor });
