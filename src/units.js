// Display-time unit conversion. The underlying recipe stays in whatever
// the cook entered; we only translate at render time so a metric reader
// sees grams/ml and an imperial reader sees cups/oz.
//
// Conversions are intentionally lossy — we round to friendly numbers
// rather than show 14 decimal places. A cup of flour reads as ~125 g
// even though the real density depends on flour and humidity.

const TO_METRIC = {
  cup:  { factor: 240,  unit: "ml" },
  cups: { factor: 240,  unit: "ml" },
  tbsp: { factor: 15,   unit: "ml" },
  tsp:  { factor: 5,    unit: "ml" },
  "fl oz": { factor: 30, unit: "ml" },
  oz:   { factor: 28,   unit: "g" },
  lb:   { factor: 454,  unit: "g" },
  pound: { factor: 454, unit: "g" },
  pounds: { factor: 454, unit: "g" },
  pint:  { factor: 473, unit: "ml" },
  quart: { factor: 946, unit: "ml" },
  gallon: { factor: 3785, unit: "ml" },
};

const TO_IMPERIAL = {
  ml:    { factor: 1 / 240, unit: "cup",   small: { threshold: 60,  factor: 1 / 15, unit: "tbsp" } },
  l:     { factor: 1000 / 240, unit: "cup" },
  g:     { factor: 1 / 454, unit: "lb",    small: { threshold: 100, factor: 1 / 28, unit: "oz" } },
  kg:    { factor: 1000 / 454, unit: "lb" },
};

// Convert one ingredient row into the target system, or return it
// unchanged if we don't recognise the unit (item descriptions stay as
// entered).
export function convertIngredient(ing, system) {
  if (!ing || !ing.unit) return ing;
  const u = ing.unit.toLowerCase().trim();
  if (system === "metric") {
    const c = TO_METRIC[u];
    if (!c) return ing;
    const out = (ing.qty || 0) * c.factor;
    // Bump ml to L when big enough; same for g to kg.
    if (c.unit === "ml" && out >= 1000) return { ...ing, qty: round(out / 1000, 2), unit: "L" };
    if (c.unit === "g" && out >= 1000)  return { ...ing, qty: round(out / 1000, 2), unit: "kg" };
    return { ...ing, qty: round(out, out >= 50 ? 0 : 1), unit: c.unit };
  }
  if (system === "imperial") {
    const c = TO_IMPERIAL[u];
    if (!c) return ing;
    const raw = (ing.qty || 0);
    if (c.small && raw < c.small.threshold) {
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
