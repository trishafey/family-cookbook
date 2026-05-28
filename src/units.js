// Display-time unit conversion. The underlying recipe stays in whatever
// the cook entered; we only translate at render time.
//
// Universal spoon-and-cup measures (cup, tbsp, tsp) stay as-is in both
// directions because they read cleanly anywhere. Everything else —
// weights and the larger volume units — flips to the chosen system.

const TO_METRIC = {
  // Weights
  oz:     { factor: 28,  unit: "g" },
  lb:     { factor: 454, unit: "g" },
  pound:  { factor: 454, unit: "g" },
  pounds: { factor: 454, unit: "g" },
  // Larger imperial volumes — small ones get ml, big ones get L
  "fl oz":{ factor: 30,   unit: "ml" },
  floz:   { factor: 30,   unit: "ml" },
  pint:   { factor: 473,  unit: "ml" },
  pints:  { factor: 473,  unit: "ml" },
  pt:     { factor: 473,  unit: "ml" },
  quart:  { factor: 946,  unit: "ml" },
  quarts: { factor: 946,  unit: "ml" },
  qt:     { factor: 946,  unit: "ml" },
  gallon: { factor: 3785, unit: "ml" },
  gallons:{ factor: 3785, unit: "ml" },
  gal:    { factor: 3785, unit: "ml" },
};

const TO_IMPERIAL = {
  g:  { factor: 1 / 454,    unit: "lb",  small: { threshold: 100, factor: 1 / 28,  unit: "oz" } },
  kg: { factor: 1000 / 454, unit: "lb" },
  ml: { factor: 1 / 240,    unit: "cup", small: { threshold: 60,  factor: 1,       unit: "ml" } },
  l:  { factor: 1000 / 240, unit: "cup" },
};

export function convertIngredient(ing, system) {
  if (!ing || !ing.unit) return ing;
  const u = ing.unit.toLowerCase().trim();
  if (system === "metric") {
    const c = TO_METRIC[u];
    if (!c) return ing;
    const out = (ing.qty || 0) * c.factor;
    // Bump ml to L for big volumes, g to kg for big weights.
    if (c.unit === "ml" && out >= 1000) return { ...ing, qty: round(out / 1000, 2), unit: "L" };
    if (c.unit === "g"  && out >= 1000) return { ...ing, qty: round(out / 1000, 2), unit: "kg" };
    return { ...ing, qty: round(out, out >= 50 ? 0 : 1), unit: c.unit };
  }
  if (system === "imperial") {
    const c = TO_IMPERIAL[u];
    if (!c) return ing;
    const raw = ing.qty || 0;
    if (c.small && raw < c.small.threshold) {
      if (c.small.unit === u) return ing; // tiny ml stays as ml
      return { ...ing, qty: round(raw * c.small.factor, 2), unit: c.small.unit };
    }
    return { ...ing, qty: round(raw * c.factor, 2), unit: c.unit };
  }
  return ing;
}

function round(n, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
