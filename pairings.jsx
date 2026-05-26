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
    recipes: [],
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
    recipes: [],
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
  "ryszards-tomato-soup": {
    recipes: ["block-party-ribs"],
    suggestions: [
      {
        title: "Homemade drop noodles (kluski lane)",
        kind: "Side",
        blurb: "Egg-yolk batter dropped from a ladle into the simmering soup — clumpy, tender, perfect for soaking up the broth.",
        time: 15,
        ingredients: [
          { qty: 1,   unit: "cup",  item: "all-purpose flour" },
          { qty: 1,   unit: "",     item: "egg yolk" },
          { qty: 0.5, unit: "cup",  item: "water" },
          { qty: 1,   unit: "pinch", item: "salt" },
        ],
        steps: [
          "Whisk flour, egg yolk, water, and salt into a thick, sticky batter. It should slowly fall off a spoon in clumps, not pour.",
          "Bring a pot of salted water (or the soup itself) to a gentle boil.",
          "Hold a ladle over the pot, scoop up some batter, and let small clumps drop in off the edge of the spoon. They'll be irregular — that's the point. NOT spaghetti-shaped.",
          "Cook until they all float to the top, ~2–3 minutes. Scoop into soup bowls and ladle the tomato soup over.",
        ],
        photoTone: "#e8d4a0",
      },
    ],
  },
  "trish-covid-bread": {
    recipes: [],
    suggestions: [
      {
        title: "Ramp herbed butter",
        kind: "Topping",
        blurb: "Spring-only. Wild ramps softened into butter with lemon and salt.",
        time: 8,
        ingredients: [
          { qty: 0.5, unit: "cup",  item: "softened butter" },
          { qty: 4,   unit: "",     item: "ramps, finely chopped (leaves and bulbs)" },
          { qty: 0.5, unit: "tsp",  item: "lemon zest" },
          { qty: 1,   unit: "pinch", item: "flaky salt" },
        ],
        steps: [
          "Sauté the chopped ramp bulbs in a teaspoon of butter for 1–2 minutes until softened. Cool.",
          "Mash everything together with the rest of the butter and lemon zest.",
          "Roll into a log in parchment, chill at least 30 min. Slice over warm bread.",
        ],
        photoTone: "#7a9a3a",
      },
      {
        title: "Cinnamon maple butter",
        kind: "Topping",
        blurb: "Sweet, warm, breakfast-leaning. Five minutes.",
        time: 5,
        ingredients: [
          { qty: 0.5, unit: "cup",  item: "softened butter" },
          { qty: 2,   unit: "tbsp", item: "real maple syrup" },
          { qty: 0.5, unit: "tsp",  item: "cinnamon" },
          { qty: 1,   unit: "pinch", item: "flaky salt" },
        ],
        steps: [
          "Whip everything together until smooth and fluffy.",
          "Spread on warm bread. Eat over the sink.",
        ],
        photoTone: "#c8884a",
      },
      {
        title: "Strawberry rhubarb jam",
        kind: "Topping",
        blurb: "Tart, jammy, in-season. No pectin needed.",
        time: 35,
        ingredients: [
          { qty: 1,   unit: "lb",   item: "strawberries, hulled and quartered" },
          { qty: 0.5, unit: "lb",   item: "rhubarb, sliced ½-inch thick" },
          { qty: 1,   unit: "cup",  item: "sugar" },
          { qty: 1,   unit: "tbsp", item: "lemon juice" },
        ],
        steps: [
          "Combine everything in a heavy pot. Let macerate 20 minutes.",
          "Bring to a simmer over medium. Cook 25–30 min, stirring often, until thick.",
          "Cool — it thickens further. Refrigerate up to 2 weeks.",
        ],
        photoTone: "#b03a3a",
      },
      {
        title: "Croque madame",
        kind: "Sandwich",
        blurb: "Two thick slices of the bread, Gruyère, ham, béchamel, fried egg on top. The bread is built for this.",
        time: 20,
        ingredients: [
          { qty: 2,   unit: "",     item: "thick slices of Covid Bread" },
          { qty: 2,   unit: "tbsp", item: "butter" },
          { qty: 2,   unit: "tbsp", item: "flour" },
          { qty: 1,   unit: "cup",  item: "whole milk, warm" },
          { qty: 0.5, unit: "cup",  item: "Gruyère, grated" },
          { qty: 2,   unit: "slices", item: "good ham" },
          { qty: 1,   unit: "tsp",  item: "Dijon mustard" },
          { qty: 1,   unit: "",     item: "egg" },
          { qty: 0,   unit: "",     item: "salt, pepper, nutmeg" },
        ],
        steps: [
          "Melt butter, whisk in flour, cook 1 min. Slowly whisk in warm milk until thick. Stir in half the Gruyère, salt, pepper, a grate of nutmeg.",
          "Spread mustard on one slice. Top with ham, half the béchamel, the other slice. Top the sandwich with more béchamel and the rest of the Gruyère.",
          "Broil until bubbly and deeply golden, 3–4 min.",
          "Fry an egg sunny-side up. Slide it on top. Serve immediately.",
        ],
        photoTone: "#e4c870",
      },
    ],
  },
  "block-party-ribs": {
    recipes: ["ryszards-tomato-soup", "trish-covid-bread"],
    suggestions: [],
  },
  "dygas-duck-dynasty": {
    recipes: [],
    suggestions: [],
  },
  "ewas-pierogies": {
    recipes: [],
    suggestions: [
      {
        title: "Meat filling (mięsem)",
        kind: "Filling",
        blurb: "Classic ground meat filling — beef, pork, or a mix. Onion, garlic, marjoram.",
        time: 25,
        ingredients: [
          { qty: 1,   unit: "lb",   item: "ground beef, pork, or a mix" },
          { qty: 1,   unit: "",     item: "yellow onion, finely diced" },
          { qty: 2,   unit: "",     item: "garlic cloves, minced" },
          { qty: 1,   unit: "tbsp", item: "butter" },
          { qty: 1,   unit: "tsp",  item: "marjoram" },
          { qty: 0,   unit: "",     item: "salt and pepper, generously" },
        ],
        steps: [
          "Sauté onion in butter until soft. Add garlic, cook 1 min.",
          "Add the meat, break it up, brown thoroughly. Drain excess fat.",
          "Stir in marjoram, salt, pepper. Cool completely before using.",
        ],
        photoTone: "#7a4a2a",
      },
      {
        title: "Sauerkraut & mushroom filling (z kapustą i grzybami)",
        kind: "Filling",
        blurb: "The Wigilia (Christmas Eve) classic. Earthy, tangy, deeply traditional.",
        time: 30,
        ingredients: [
          { qty: 1,   unit: "cup",  item: "dried wild mushrooms (or 0.5 lb fresh cremini)" },
          { qty: 2,   unit: "cups", item: "sauerkraut, drained and squeezed dry" },
          { qty: 1,   unit: "",     item: "yellow onion, finely diced" },
          { qty: 2,   unit: "tbsp", item: "butter" },
          { qty: 0,   unit: "",     item: "salt and pepper, to taste" },
        ],
        steps: [
          "Soak dried mushrooms in warm water 20 min, then chop. (If using fresh, just chop them.)",
          "Sauté onion in butter until soft. Add mushrooms, cook until any liquid evaporates.",
          "Add the squeezed sauerkraut. Cook 10–12 min until everything is unified and almost dry.",
          "Season, cool completely, fill the pierogies.",
        ],
        photoTone: "#5a4a2a",
      },
      {
        title: "Blueberry filling (z jagodami)",
        kind: "Filling",
        blurb: "Summer pierogies. Sweet, jammy, finished with sour cream and sugar.",
        time: 5,
        ingredients: [
          { qty: 2,   unit: "cups", item: "blueberries (fresh or frozen, don't thaw)" },
          { qty: 2,   unit: "tbsp", item: "sugar" },
          { qty: 1,   unit: "tsp",  item: "cornstarch" },
        ],
        steps: [
          "Toss the blueberries with sugar and cornstarch right before filling — they'll jam inside the pierogi as they boil.",
          "Use slightly less filling than a savory pierogi (the juices expand). Seal extra well.",
          "Serve hot with melted butter, sour cream, and a dusting of sugar.",
        ],
        photoTone: "#4a2858",
      },
    ],
  },
  "kt-turkey": {
    recipes: ["krystyna-apple-meringue-pie"],
    suggestions: [
      {
        title: "Mashed potatoes",
        kind: "Side",
        blurb: "The plate's foundation. Butter, milk, salt, restraint.",
        time: 35,
        ingredients: [
          { qty: 3,   unit: "lb",   item: "Yukon Gold potatoes, peeled and chunked" },
          { qty: 0.5, unit: "cup",  item: "butter" },
          { qty: 0.5, unit: "cup",  item: "whole milk or cream, warmed" },
          { qty: 0,   unit: "",     item: "salt and pepper, to taste" },
        ],
        steps: [
          "Cover potatoes with cold salted water. Bring to a boil. Simmer 18–22 min until fork-tender.",
          "Drain well. Return to the warm pot for 30 seconds to dry.",
          "Mash with butter, then the warm milk. Season aggressively with salt and pepper.",
        ],
        photoTone: "#e8d8a0",
      },
      {
        title: "Glazed carrots",
        kind: "Side",
        blurb: "Brown butter, honey, thyme. Caramelized edges, tender centers.",
        time: 25,
        ingredients: [
          { qty: 2,   unit: "lb",   item: "carrots, peeled and halved lengthwise" },
          { qty: 3,   unit: "tbsp", item: "butter" },
          { qty: 2,   unit: "tbsp", item: "honey" },
          { qty: 4,   unit: "",     item: "thyme sprigs" },
          { qty: 0,   unit: "",     item: "salt and pepper" },
        ],
        steps: [
          "Boil the carrots in salted water 6–8 min until just tender. Drain.",
          "Melt butter in a wide skillet until lightly browned. Add carrots, honey, thyme.",
          "Toss over medium-high until deeply glazed and caramelized, 6–8 min. Season.",
        ],
        photoTone: "#c08a3a",
      },
      {
        title: "Brussels sprouts",
        kind: "Side",
        blurb: "Roasted hard until crispy outside, custardy inside. Optional bacon.",
        time: 30,
        ingredients: [
          { qty: 2,   unit: "lb",   item: "Brussels sprouts, halved" },
          { qty: 3,   unit: "tbsp", item: "olive oil" },
          { qty: 4,   unit: "oz",   item: "bacon, chopped (optional)" },
          { qty: 0,   unit: "",     item: "salt and pepper" },
          { qty: 1,   unit: "tbsp", item: "balsamic glaze (optional)" },
        ],
        steps: [
          "425°F. Toss halved sprouts with olive oil and salt, cut-side down on a sheet pan.",
          "Scatter bacon if using. Roast 22–28 min until the cut sides are deeply browned.",
          "Drizzle with balsamic glaze and serve.",
        ],
        photoTone: "#5a7a3a",
      },
      {
        title: "Roasted asparagus",
        kind: "Side",
        blurb: "Quick, bright, garlicky. Hits the plate last so it stays vivid green.",
        time: 15,
        ingredients: [
          { qty: 2,   unit: "lb",   item: "asparagus, woody ends snapped off" },
          { qty: 2,   unit: "tbsp", item: "olive oil" },
          { qty: 2,   unit: "",     item: "garlic cloves, minced" },
          { qty: 1,   unit: "",     item: "lemon, zested" },
          { qty: 0,   unit: "",     item: "flaky salt + black pepper" },
        ],
        steps: [
          "425°F. Toss asparagus with oil, garlic, salt, pepper on a sheet pan.",
          "Roast 10–12 min until tender with crisp tips.",
          "Finish with lemon zest. Serve immediately.",
        ],
        photoTone: "#7a8a3a",
      },
    ],
  },
  "pierniki-gingerbread": {
    recipes: [],
    suggestions: [
      {
        title: "Royal icing (decorative)",
        kind: "Topping",
        blurb: "Stiff, white icing that sets hard — perfect for piping ornament designs.",
        time: 10,
        ingredients: [
          { qty: 1,   unit: "",     item: "egg white" },
          { qty: 2,   unit: "cups", item: "powdered sugar, sifted" },
          { qty: 0.5, unit: "tsp",  item: "lemon juice or vinegar" },
          { qty: 0,   unit: "",     item: "food coloring (optional)" },
        ],
        steps: [
          "Whisk the egg white until frothy.",
          "Slowly add powdered sugar, whisking until smooth and glossy. Add lemon juice.",
          "Adjust consistency: thicker for piping outlines, thinner (add a drop of water) for flood-filling.",
          "Transfer to a piping bag with a fine tip. Pipe outlines first, let dry 10 min, then flood.",
        ],
        photoTone: "#f4ead8",
      },
    ],
  },
  "krystyna-apple-meringue-pie": {
    recipes: [],
    suggestions: [],
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
