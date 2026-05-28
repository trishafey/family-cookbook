// Display-time unit conversion. The underlying recipe stays in whatever
// the cook entered; we only translate at render time.
//
// Scope is intentionally narrow: only WEIGHTS (oz/lb ↔ g/kg) and bulk
// METRIC LIQUIDS (ml/L → cups). Spoon-and-cup measures (cup/tbsp/tsp,
// pint/quart) are kept as-is because they're already universally
// understood and converting them produces awkward numbers
// (a cup of flour ≠ a fixed mass).

const TO_METRIC = {
  oz:     { factor: 28,  unit: "g" },
  lb:     { factor: 454, unit: "g" },
  pound:  { factor: 454, unit: "g" },
  pounds: { factor: 454, unit: "g" },
};

const TO_IMPERIAL = {
  // Weight metric → lb / oz (whichever's friendlier)
  g:  { factor: 1 / 454, unit: "lb",  small: { threshold: 100, factor: 1 / 28,  unit: "oz" } },
  kg: { factor: 1000 / 454, unit: "lb" },
  // Bulk liquid metric → cups (small amounts stay metric, since US
  // recipes rarely use sub-cup imperial volume).
  ml: { factor: 1 / 240, unit: "cup", small: { threshold: 60, factor: 1, unit: "ml" } },
  l:  { factor: 1000 / 240, unit: "cup" },
};

export function convertIngredient(ing, system) {
  if (!ing || !ing.unit) return ing;
  const u = ing.unit.toLowerCase().trim();
  if (system === "metric") {
    const c = TO_METRIC[u];
    if (!c) return ing;
    const out = (ing.qty || 0) * c.factor;
    if (c.unit === "g" && out >= 1000) return { ...ing, qty: round(out / 1000, 2), unit: "kg" };
    return { ...ing, qty: round(out, out >= 50 ? 0 : 1), unit: c.unit };
  }
  if (system === "imperial") {
    const c = TO_IMPERIAL[u];
    if (!c) return ing;
    const raw = ing.qty || 0;
    if (c.small && raw < c.small.threshold) {
      // For 'ml' under threshold we keep it as-is; matching the rule
      // that tiny liquid amounts don't translate cleanly.
      if (c.small.unit === u) return ing;
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
