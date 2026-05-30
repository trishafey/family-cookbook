// Shared utilities & primitives for the cookbook.

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

// ───── Math / formatting ─────

// Render a fractional quantity nicely. 0.5 → "½", 1.25 → "1¼"
// Format an ingredient's display quantity. Family-cook intuitive
// measures ("by eye", "a glug", "to taste") live in i.qtyNote and
// are shown verbatim — they're how the recipe is taught, not
// gaps to be filled with bogus precision. Falls back to the
// numeric qty + unit when qtyNote isn't set.
export function formatIngredientQty(i) {
  const note = (i?.qtyNote || "").trim();
  if (note) return note;
  return `${formatQty(i?.qty)} ${i?.unit || ""}`.trim();
}

export function formatQty(n) {
  if (n == null || n === 0 || isNaN(n)) return "";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  const whole = Math.floor(n);
  const frac = n - whole;
  const FRACS = [
    [1/8, "⅛"], [1/4, "¼"], [1/3, "⅓"], [3/8, "⅜"],
    [1/2, "½"], [5/8, "⅝"], [2/3, "⅔"], [3/4, "¾"], [7/8, "⅞"]
  ];
  let bestF = "";
  let bestDiff = 0.04;
  for (const [v, s] of FRACS) {
    const d = Math.abs(frac - v);
    if (d < bestDiff) { bestDiff = d; bestF = s; }
  }
  if (bestF) return `${sign}${whole || ""}${bestF}`.trim();
  // fall back to rounded decimal
  if (n < 0.1) return n.toFixed(2);
  if (n < 10)  return (Math.round(n * 4) / 4).toString();
  return Math.round(n).toString();
}

// Scale an ingredient list by a factor.
export function scaleIngredients(ings, factor) {
  return ings.map(i => ({ ...i, qty: i.qty ? i.qty * factor : 0 }));
}

// Scale a weight-based recipe (prime rib). Updates qty proportionally
// and the "cook" mins for any step marked dynamic:"cook".
export function scaleByWeight(recipe, newWeight) {
  const factor = newWeight / recipe.weightDefault;
  const ings = recipe.ingredients.map(i => {
    if (i.scalesWithWeight && i.perLb != null) {
      return { ...i, qty: i.perLb * newWeight };
    }
    if (i.scalesWithWeight) {
      return { ...i, qty: i.qty * factor };
    }
    return { ...i };
  });
  const cookMins = Math.round(newWeight * recipe.cookMinsPerLb);
  const restMins = recipe.restMinsPerLb ? Math.round(newWeight * recipe.restMinsPerLb) : null;
  const fillTemplates = (d) => {
    let out = d.replace("{COOKMINS}", cookMins);
    if (restMins != null) out = out.replace("{RESTMINS}", restMins);
    return out;
  };
  const steps = recipe.steps.map(s => {
    if (s.dynamic === "cook") return { ...s, mins: cookMins, d: fillTemplates(s.d) };
    if (s.dynamic === "rest" && restMins != null) return { ...s, mins: restMins, d: fillTemplates(s.d) };
    return { ...s, d: fillTemplates(s.d) };
  });
  return { ings, steps, cookMins, restMins, factor };
}

// Combine ingredients from multiple scaled recipes into a single shopping list,
// grouped by item-name with summed quantities where units match.
export function buildShoppingList(scaledLists) {
  const map = new Map();
  for (const list of scaledLists) {
    for (const ing of list) {
      if (!ing.item) continue;
      const key = `${ing.item.toLowerCase()}|${ing.unit}`;
      const prev = map.get(key);
      if (prev) {
        prev.qty += ing.qty || 0;
      } else {
        map.set(key, { ...ing });
      }
    }
  }
  // group by ing.grp -> "Produce", "Dairy", etc. but we don't have departments;
  // we'll bucket by the first letter into Pantry / Fresh by simple heuristics.
  const buckets = { Produce: [], "Meat & Seafood": [], Dairy: [], Pantry: [], Other: [] };
  const PRODUCE = /onion|garlic|lemon|herb|parsley|basil|thyme|rosemary|scallion|tomato|shallot|blueberr|potato|ginger|cilantro|mint/i;
  const MEAT    = /beef|chicken|sausage|pork|brisket|chuck|rib|clam|fish|sea/i;
  const DAIRY   = /butter|milk|cheese|parm|ricotta|mozzarella|buttermilk|egg|cream/i;
  for (const ing of map.values()) {
    if (PRODUCE.test(ing.item)) buckets.Produce.push(ing);
    else if (MEAT.test(ing.item)) buckets["Meat & Seafood"].push(ing);
    else if (DAIRY.test(ing.item)) buckets.Dairy.push(ing);
    else buckets.Pantry.push(ing);
  }
  for (const k of Object.keys(buckets)) {
    if (!buckets[k].length) delete buckets[k];
    else buckets[k].sort((a, b) => a.item.localeCompare(b.item));
  }
  return buckets;
}

// ───── Time scheduling — "done by 6pm" ─────
// Schedule steps backwards from finishTime. Steps marked overnight (or any
// step ≥ OVERNIGHT_THRESHOLD minutes) are treated as a fridge / freezer /
// proof park: instead of literally backing the start up by the full
// duration (which produces "wake at 4am" schedules), the overnight step
// is placed so its END is when the next step needs it, and its START
// is the previous evening at OVERNIGHT_EVENING_HOUR. Steps before an
// overnight then schedule backwards from that previous evening.
//
// Result schedule items get an optional `dayOffset` (0 = day-of, -1 =
// day before, etc.) and an `overnight: true` marker on the rest steps.
const OVERNIGHT_THRESHOLD_MIN = 4 * 60;
const OVERNIGHT_EVENING_HOUR = 19; // 7pm — when "make the dough" usually happens
const NO_EARLIER_THAN_HOUR = 7;    // 7am — refuse to schedule active prep before this

const startOfHour = (d, h) => {
  const out = new Date(d);
  out.setHours(h, 0, 0, 0);
  return out;
};

export function scheduleForFinish(steps, finishTime, { eveningHour = OVERNIGHT_EVENING_HOUR } = {}) {
  const totalMin = steps.reduce((s, x) => s + (x.mins || 0), 0);
  const finish = new Date(finishTime);
  const dayOf = new Date(finish); dayOf.setHours(0, 0, 0, 0);

  // Sort identification: a step is overnight if explicitly flagged or if
  // its duration would otherwise produce a pre-dawn schedule.
  const isOvernight = (s) => s.overnight === true || (s.mins || 0) >= OVERNIGHT_THRESHOLD_MIN;

  let cursor = new Date(finish);
  const out = new Array(steps.length);
  let currentDayOffset = 0;

  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    const mins = step.mins || 0;
    const end = new Date(cursor);

    if (isOvernight(step)) {
      // End of overnight = when the next step starts.
      // Start of overnight = the previous evening at eveningHour.
      currentDayOffset -= 1;
      const previousDay = new Date(dayOf);
      previousDay.setDate(previousDay.getDate() + currentDayOffset);
      const start = startOfHour(previousDay, eveningHour);
      out[i] = { start, end, overnight: true, dayOffset: currentDayOffset };
      cursor = start;
    } else {
      const start = new Date(cursor.getTime() - mins * 60000);
      out[i] = { start, end, dayOffset: currentDayOffset };
      cursor = start;

      // If active prep is being pushed before 7am of its day, that's a
      // hint there's a long-but-not-overnight rest step earlier; flip
      // that step to overnight on the next iteration by lowering the day.
      const startHour = start.getHours();
      if (startHour < NO_EARLIER_THAN_HOUR && i > 0 && (steps[i - 1].mins || 0) >= 90) {
        // Force the previous step to span overnight by jumping cursor
        // to evening of the previous day.
        currentDayOffset -= 1;
        const previousDay = new Date(dayOf);
        previousDay.setDate(previousDay.getDate() + currentDayOffset);
        cursor = startOfHour(previousDay, eveningHour);
      }
    }
  }

  return { schedule: out, totalMin, startTime: cursor };
}

// Re-schedule from a particular step that's already been adjusted —
// fix that step's end time and ripple downstream steps to keep the
// chain consistent. Used when the cook says "step 3 took an extra 10
// minutes" in cook mode.
export function rescheduleFrom(schedule, steps, adjustedIndex, newEnd) {
  const out = schedule.map(s => ({ ...s }));
  out[adjustedIndex] = { ...out[adjustedIndex], end: new Date(newEnd) };
  let cursor = new Date(newEnd);
  for (let i = adjustedIndex + 1; i < steps.length; i++) {
    const mins = steps[i].mins || 0;
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + mins * 60000);
    out[i] = { ...out[i], start, end };
    cursor = end;
  }
  return out;
}

export function fmtTime(d) {
  if (!d) return "—";
  let h = d.getHours();
  const m = d.getMinutes();
  const am = h < 12;
  h = h % 12 || 12;
  const mm = m < 10 ? `0${m}` : m;
  return `${h}:${mm}${am ? "am" : "pm"}`;
}
export function fmtDuration(min) {
  if (!min) return "0 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ───── Storage ─────
export function useStorage(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : JSON.parse(raw);
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key, v]);
  return [v, setV];
}

// Apply a per-language translation overlay on top of a canonical recipe.
// Quantities, units, sections, precision, mins, etc. stay canonical so
// scaling and scheduling keep working — only the user-authored text
// fields (title / subtitle / ingredient items / step titles+descriptions
// / tips) flip to the requested language. Falls through to the canonical
// fields whenever a translation hasn't landed yet.
export function localizeRecipe(r, lang) {
  if (!r || !lang || lang === "en") return r;
  const tr = r.translations?.[lang];
  if (!tr) return r;
  return {
    ...r,
    title:    tr.title    || r.title,
    subtitle: tr.subtitle || r.subtitle,
    tips:     tr.tips     || r.tips,
    ingredients: (r.ingredients || []).map((ing, i) => ({
      ...ing,
      item: tr.ingredients?.[i]?.item || ing.item,
    })),
    steps: (r.steps || []).map((step, i) => ({
      ...step,
      t: tr.steps?.[i]?.t || step.t,
      d: tr.steps?.[i]?.d || step.d,
    })),
  };
}

// Backfill defaults for fields the UI assumes exist. Older user-added
// recipes can be missing arrays or nested objects; rendering crashes
// rather than degrading without this.
export function normalizeRecipe(r) {
  return {
    ...r,
    diet: r.diet || [],
    tips: r.tips || [],
    comments: r.comments || [],
    liveComments: r.liveComments || [],
    ingredients: r.ingredients || [],
    steps: r.steps || [],
    nutrition: { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, ...(r.nutrition || {}) },
    servingsDefault: r.servingsDefault || 1,
    difficulty: r.difficulty || "Easy",
  };
}

// ───── Recipes (from the cookbook API, with localStorage as offline cache) ─────
// On first render this returns whatever was cached last time (instant), then
// fetches /api/recipes in the background and updates when fresh data arrives.
// `loading` is only true when the cache is empty AND the network hasn't
// resolved yet — so returning visitors never see a loading spinner.
export function useRecipes() {
  const [rawRecipes, setRecipes] = useStorage("recipes:cache", []);
  // Re-normalize cached recipes too — a stale cache from before the
  // normalizer existed might still be missing fields.
  const recipes = useMemo(() => rawRecipes.map(normalizeRecipe), [rawRecipes]);
  const [loading, setLoading] = useState(() => {
    try { return !localStorage.getItem("recipes:cache"); } catch { return true; }
  });
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/recipes");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecipes(data.map(normalizeRecipe));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [setRecipes]);

  useEffect(() => { refresh(); }, [refresh]);

  return { recipes, loading, error, refresh };
}

// ───── Auth (via Cloudflare Access) ─────
// Returns the signed-in user's email, or null if not signed in. The
// /api/admin/me endpoint sits behind Access; with Accept: application/json
// it returns 401 cleanly when the user isn't authenticated, so we can
// detect sign-in state without a redirect dance.
export function useAuth() {
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/me", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setEmail(data.email);
      } else {
        setEmail(null);
      }
    } catch {
      setEmail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { email, loading, refresh };
}

// Per-user favorites, stored server-side in D1. Fetches the signed-in
// user's faves on mount; falls back to an empty list when signed out.
// toggle() updates locally first for instant UI then POSTs/DELETEs in
// the background.
export function useFavorites(authEmail) {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    if (!authEmail) { setFavorites([]); return; }
    fetch("/api/admin/favorites", { credentials: "include", headers: { Accept: "application/json" } })
      .then(res => res.ok ? res.json() : [])
      .then(setFavorites)
      .catch(() => setFavorites([]));
  }, [authEmail]);

  const toggle = useCallback(async (id) => {
    if (!authEmail) {
      alert("Sign in to save favorites.");
      return;
    }
    const adding = !favorites.includes(id);
    setFavorites(prev => adding ? [...prev, id] : prev.filter(x => x !== id));
    try {
      await fetch(`/api/admin/favorites/${encodeURIComponent(id)}`, {
        method: adding ? "POST" : "DELETE",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
    } catch {
      // revert on failure
      setFavorites(prev => adding ? prev.filter(x => x !== id) : [...prev, id]);
    }
  }, [authEmail, favorites]);

  return { favorites, toggleFavorite: toggle };
}

// Build a URL that, when navigated to, will route the user through
// Cloudflare Access (login if needed) and return them to `returnTo`.
export function signInUrl(returnTo) {
  const target = returnTo ?? (window.location.pathname + window.location.search);
  return `/api/admin/login?return=${encodeURIComponent(target)}`;
}

// Cloudflare Access's built-in logout URL — clears the session cookie.
export const SIGN_OUT_URL = "/cdn-cgi/access/logout";

// Best-effort behavioural event log. Fire-and-forget — failures
// (offline, anonymous user, 500) are swallowed so analytics never
// breaks the surface that triggered them.
export function logEvent(event, recipeId = null, meta = null) {
  try {
    fetch("/api/admin/events", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, recipeId, meta }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignore — fetch can throw synchronously in rare edge cases (e.g.
    // CSP block). We never want analytics to crash the app.
  }
}

// Catches render errors below it and displays them inline. Useful so
// production crashes don't leave a blank page with no signal.
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, maxWidth: 760, margin: "40px auto", fontFamily: "var(--sans)" }}>
        <h2 style={{ color: "#C42807", marginTop: 0 }}>Something broke rendering this page.</h2>
        <pre style={{ background: "var(--paper-2)", padding: 16, borderRadius: 6, overflow: "auto", fontSize: 13, color: "var(--ink)" }}>
{String(this.state.error?.message || this.state.error)}
{"\n\n"}
{this.state.error?.stack}
        </pre>
        <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}



// ───── Filtering ─────
export function applyFilters(recipes, { q, courses, diets, occasions, authors, cuisines, maxTime, difficulties }) {
  return recipes.filter(r => {
    if (q) {
      const hay = `${r.title} ${r.author} ${r.cuisine} ${r.subtitle} ${r.course}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    if (courses?.length && !courses.includes(r.course)) return false;
    if (occasions?.length && !occasions.includes(r.occasion)) return false;
    if (authors?.length && !authors.includes(r.author)) return false;
    if (cuisines?.length && !cuisines.includes(r.cuisine)) return false;
    if (difficulties?.length && !difficulties.includes(r.difficulty)) return false;
    if (diets?.length && !diets.some(d => r.diet.includes(d))) return false;
    if (maxTime && r.total > maxTime) return false;
    return true;
  });
}

// ───── Icons ─────
export const Icon = ({ name, size = 16 }) => {
  // Botanical icon set. Stroke-width 1.2 for a finer, more
  // illustrative line than the previous 1.7. Some glyphs embed
  // animation hook classes (.nod, .sweep, .vine, .bloom, .grow,
  // .bub, .bub2, .bub3, .stir, .bloomgrow) which fire on hover
  // of interactive parents — see app.css `Botanical icon
  // animations` block. `.seed` paints a sub-shape with
  // currentColor instead of using the outline stroke.
  const paths = {
    // ── Botanical alphabet (decorative accents for pills/tags) ──
    curl:      <path d="M6 20 C6 12 9 7 14 7 C17 7 18.4 9.8 16.6 11.4 C15.2 12.6 13.6 11.6 14 9.8" />,
    leaf:      <><path d="M5 19 C5 11 11 5 19 5 C19 13 13 19 5 19 Z" /><path d="M8.5 15.5 L15.5 8.5" /><path d="M11 15 L12.5 13.5 M9.5 12.5 L11 11" /></>,
    blossom:   <g className="bloom"><circle cx="12" cy="7.4" r="2.4" /><circle cx="16.7" cy="11" r="2.4" /><circle cx="14.9" cy="16.4" r="2.4" /><circle cx="9.1" cy="16.4" r="2.4" /><circle cx="7.3" cy="11" r="2.4" /><circle cx="12" cy="12" r="1.5" /></g>,
    sprig:     <><path d="M12 21 C12 15 12 9 13 4" /><path d="M12.2 16 C9 16.6 7 15 6.6 12.4 C9.7 11.9 11.8 13.5 12.2 16 Z" /><path d="M12.5 12 C15.6 11.4 17.4 9.3 17.1 6.7 C14 7.2 12.1 9.4 12.5 12 Z" /><path d="M12.8 8.5 C10.4 8 9.1 6.2 9.4 4.2 C11.8 4.7 13.1 6.5 12.8 8.5 Z" /></>,
    arch:      <><path d="M5 21 V12 A7 7 0 0 1 19 12 V21" /><path d="M3.5 21 H6.5 M17.5 21 H20.5" /></>,

    // ── Core navigation (animated on hover) ──
    search:    <><circle cx="11" cy="11" r="6.2" /><path className="vine" d="M15.4 15.4 C17.6 17.6 18.9 18.9 19.9 18.4 C20.8 18 20.4 16.5 18.9 16.4" /></>,
    plus:      <><path d="M12 20.5 V11 M7.5 15.5 H16.5" /><path className="nod" d="M12 11 C12 7.6 14.4 5.4 17.6 6 C17.6 9.4 15.2 11.6 12 11 Z" /><path className="nod" d="M13 9.6 C14.4 8.6 15.6 8 16.8 7.8" /></>,
    timer:     <><circle cx="12" cy="13.7" r="7.4" /><path className="sweep" d="M12 13.7 V8.4" /><path d="M9.6 3 H14.4 M12 3 V5.6" /></>,
    home:      <><path d="M4 11.5 L12 4.5 L20 11.5 V20 H4 Z" /><path d="M9.4 20 V15 A2.6 2.6 0 0 1 14.6 15 V20" /></>,
    book:      <><path d="M12 6.4 C10 4.8 6.6 4.8 4 5.4 V19 C6.6 18.4 10 18.4 12 20 C14 18.4 17.4 18.4 20 19 V5.4 C17.4 4.8 14 4.8 12 6.4 Z" /><path d="M12 6.4 V20" /></>,
    save:      <><path d="M7 4 H17 V20 L12 16 L7 20 Z" /><path d="M12 8 C10.6 8 9.6 9 9.6 10.4 C11 10.4 12 9.4 12 8 Z" /></>,
    favourite: <><path d="M12 20 C5 15.5 3 12 3 8.6 A4.4 4.4 0 0 1 12 7 A4.4 4.4 0 0 1 21 8.6 C21 12 19 15.5 12 20 Z" /><path d="M12 20.5 V10.5" /><path d="M12 14 L8.6 11.2 M12 14 L15.4 11.2 M12 17 L9.6 14.8 M12 17 L14.4 14.8" /></>,
    favouriteFill: <><path d="M12 20 C5 15.5 3 12 3 8.6 A4.4 4.4 0 0 1 12 7 A4.4 4.4 0 0 1 21 8.6 C21 12 19 15.5 12 20 Z" fill="currentColor" /></>,
    chef:      <path d="M7 21h10M6.5 17h11v-1.8c2 0 3.5-1.6 3.5-3.6a3.6 3.6 0 0 0-4.7-3.4 4.6 4.6 0 0 0-8.6 0A3.6 3.6 0 0 0 3 12c0 2 1.5 3.4 3.5 3.4V17Z" />,
    print:     <path d="M7 9V4h10v5M7 18H4.5v-7h15v7H17M7 14h10v6H7v-6Z" />,
    menu:      <><path d="M4 7 H20 M4 12 H16 M4 17 H11" /><path d="M16 12 C18 11.6 19.4 12.6 19.6 14.6 C17.6 14.8 16.2 14 16 12 Z" /></>,

    // ── Recipe types & pages (featured, animated) ──
    experiment: <><path d="M9.8 4.5 H14.2" /><path d="M10.2 4.5 V9.5 L6.6 17.3 A2.2 2.2 0 0 0 8.6 20.2 H15.4 A2.2 2.2 0 0 0 17.4 17.3 L13.8 9.5 V4.5" /><path d="M8.5 14 H15.5" /><circle className="bub seed" cx="10.8" cy="17" r="0.8" /><circle className="bub bub2 seed" cx="13" cy="16.2" r="0.7" /><circle className="bub bub3 seed" cx="11.8" cy="18.4" r="0.6" /></>,
    // Same beaker shape without the bubble-animation classes —
    // for badges/tags where the constant motion would be noisy.
    experimentStill: <><path d="M9.8 4.5 H14.2" /><path d="M10.2 4.5 V9.5 L6.6 17.3 A2.2 2.2 0 0 0 8.6 20.2 H15.4 A2.2 2.2 0 0 0 17.4 17.3 L13.8 9.5 V4.5" /><path d="M8.5 14 H15.5" /><circle className="seed" cx="10.8" cy="17" r="0.8" /><circle className="seed" cx="13" cy="16.2" r="0.7" /><circle className="seed" cx="11.8" cy="18.4" r="0.6" /></>,
    build:     <><path d="M4 12 H20 L18.4 18 A3 3 0 0 1 15.5 20 H8.5 A3 3 0 0 1 5.6 18 L4 12 Z" /><path d="M4 12 H20" /><g className="stir"><path d="M12 15 L15.2 6" /><ellipse cx="12" cy="15.2" rx="2.4" ry="1.5" /><circle cx="15.6" cy="5" r="1.3" /><circle cx="14.2" cy="4.7" r="0.9" /><circle cx="17" cy="4.7" r="0.9" /><circle cx="14.8" cy="6.2" r="0.9" /><circle cx="16.4" cy="6.2" r="0.9" /></g></>,
    heirloom:  <><path d="M12 8.5 C7.5 8.5 5.5 12 5.5 14.8 A6.5 6.3 0 0 0 18.5 14.8 C18.5 12 16.5 8.5 12 8.5 Z" /><path d="M12 8.5 V5.6" /><path d="M12 8 C10.2 8 8.8 7 8.2 5.4 C10 5.4 11.3 6.4 12 8 Z" /><path d="M12 8 C13.8 8 15.2 7 15.8 5.4 C14 5.4 12.7 6.4 12 8 Z" /><path d="M12 8 C11.4 6.4 11.4 4.8 12 3.8 C12.6 4.8 12.6 6.4 12 8 Z" /></>,
    new:       <><path d="M12 21 V11" /><path d="M12 13 C12 9 9 6 4.5 6 C4.5 10.5 7.5 13 12 13 Z" /><path d="M12 11 C12 7.6 14.8 5 19.5 5 C19.5 9 16.6 11 12 11 Z" /></>,

    // ── Secondary actions ──
    rate:      <path d="m12 3 2.6 6 6.4.6-4.8 4.4 1.4 6.4L12 17l-5.6 3.4 1.4-6.4L3 9.6 9.4 9 12 3Z" />,
    rateFill:  <path d="m12 3 2.6 6 6.4.6-4.8 4.4 1.4 6.4L12 17l-5.6 3.4 1.4-6.4L3 9.6 9.4 9 12 3Z" fill="currentColor" />,
    starfruit: <><path d="M12 3.5 L13.9 9.2 L19.8 9.2 L15 12.8 L16.9 18.5 L12 15 L7.1 18.5 L9 12.8 L4.2 9.2 L10.1 9.2 Z" /><path d="M12 8.2 V13" /><circle className="seed" cx="12" cy="10.7" r=".7" /><circle className="seed" cx="10.6" cy="11.6" r=".6" /><circle className="seed" cx="13.4" cy="11.6" r=".6" /></>,
    filter:    <path d="M3 6h18M6 12h12M10 18h4" />,
    edit:      <><path d="M4 20 L4.2 16.4 L15.4 5.2 L18.8 8.6 L7.6 19.8 L4 20 Z" /><path d="M13.2 7.4 L16.6 10.8" /><path d="M4.2 16.4 L7.6 19.8" /></>,
    share:     <><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="6" r="2.6" /><circle cx="18" cy="18" r="2.6" /><path d="M8.3 10.8 15.7 7.2 M8.3 13.2 15.7 16.8" /></>,
    capture:   <><path d="M4 8.5 H7 L8.5 6 H15.5 L17 8.5 H20 V19 H4 Z" /><circle cx="12" cy="13.2" r="3.4" /></>,
    attach:    <path d="M9 7 V16 A3 3 0 0 0 15 16 V6 A2 2 0 0 0 11 6 V15 A1 1 0 0 0 13 15 V8" />,
    send:      <><path d="M21 4 L3 11 L10 13.5 L12.5 20.5 L21 4 Z" /><path d="M10 13.5 L21 4" /></>,
    comment:   <><path d="M12 4 C12 4 5 6 5 11 C5 16 9 20 12 20 C15 20 19 16 19 11 C19 6 12 4 12 4 Z" /><path d="M9.5 12 A2.5 2 0 0 0 14.5 12" /></>,
    focus:     <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8.5" /><path d="M12 4 V6 M12 18 V20 M4 12 H6 M18 12 H20" /></>,
    verify:    <><path d="M5 5 H19 V11 C19 16 15.5 19 12 20 C8.5 19 5 16 5 11 V5 Z" /><path d="M9 10 L11 12 L15.5 8" /></>,

    // ── Diet & nutrition (for pills / filter tags) ──
    vegan:        <><path className="grow" d="M12 21 V11" /><path className="grow" d="M12 13 C12 9 9 6 4.5 6 C4.5 10.5 7.5 13 12 13 Z" /><path className="grow" d="M12 11 C12 7.6 14.8 5 19.5 5 C19.5 9 16.6 11 12 11 Z" /></>,
    vegetarian:   <><path d="M5 19 C5 11 11 5 19 5 C19 13 13 19 5 19 Z" /><path d="M8.5 15.5 L15.5 8.5" /><path d="M11 15 L12.5 13.5 M9.5 12.5 L11 11" /></>,
    pescatarian:  <><path d="M3.5 12 C6.5 8.5 11 8.5 14.5 12 C11 15.5 6.5 15.5 3.5 12 Z" /><path d="M14.5 12 L19.5 9 V15 Z" /><circle className="seed" cx="7" cy="11.4" r=".8" /></>,
    carnivore:    <><path d="M6.5 8.4 C10 6 16 6.2 18.2 9 C20.2 11.6 18.8 16 14.8 17.6 C10.6 19.3 5.6 17.4 5 13.2 C4.7 11.1 5.1 9.4 6.5 8.4 Z" /><circle cx="9" cy="12.2" r="1.8" /><path d="M12.4 9.8 C13.8 11.2 13.8 14 12.4 15.6" /></>,
    highProtein:  <path d="M12 3 C8.4 3 5.5 9 5.5 13.5 A6.5 6.5 0 0 0 18.5 13.5 C18.5 9 15.6 3 12 3 Z" />,
    highFibre:    <><path d="M12 21 V7" /><path d="M12 9 C12 6.5 13 4.5 15 3.5 C15.4 5.6 14.2 7.8 12 9 Z" /><path d="M12 13 C12 10.8 13.4 9 15.6 8.2 C16 10.2 14.6 12.4 12 13 Z" /><path d="M12 13 C12 10.8 10.6 9 8.4 8.2 C8 10.2 9.4 12.4 12 13 Z" /><path d="M12 17 C12 14.8 13.4 13 15.6 12.2 C16 14.2 14.6 16.4 12 17 Z" /><path d="M12 17 C12 14.8 10.6 13 8.4 12.2 C8 14.2 9.4 16.4 12 17 Z" /></>,
    lowCarb:      <><path d="M12 21 C8.4 21 6 17 6 12.8 C6 8 9 3.5 12 3.5 C15 3.5 18 8 18 12.8 C18 17 15.6 21 12 21 Z" /><circle cx="12" cy="14" r="2.8" /></>,
    lowCalorie:   <><path d="M5 19 C9 19 13 17.2 16 14.2 C19 11.2 20 7 20 4 C17 4 12.8 5 9.8 8 C6.8 11 5 15 5 19 Z" /><path d="M5 19 L13.5 10.5" /><path d="M9 15 L13.5 15 M11 12.5 L15.5 12.5 M13 10 L17 10" /></>,
    glutenFree:   <><path d="M12 20.5 V8" /><path d="M12 9 C12 7.2 13 5.8 14.6 5.3 C14.8 7.1 13.8 8.6 12 9 Z" /><path d="M12 9 C12 7.2 11 5.8 9.4 5.3 C9.2 7.1 10.2 8.6 12 9 Z" /><path d="M12 12.5 C12 10.7 13 9.3 14.6 8.8 C14.8 10.6 13.8 12.1 12 12.5 Z" /><path d="M12 12.5 C12 10.7 11 9.3 9.4 8.8 C9.2 10.6 10.2 12.1 12 12.5 Z" /><path d="M12 16 C12 14.2 13 12.8 14.6 12.3 C14.8 14.1 13.8 15.6 12 16 Z" /><path d="M12 16 C12 14.2 11 12.8 9.4 12.3 C9.2 14.1 10.2 15.6 12 16 Z" /><path d="M5 19 L19 5" /></>,
    dairyFree:    <><path d="M9 8.5 L8.5 18 A2 2 0 0 0 10.5 20 H13.5 A2 2 0 0 0 15.5 18 L15 8.5 Z" /><path d="M8.7 8.5 H15.3" /><path d="M9 8.5 C9 6.9 10 6.3 11.2 6.6" /><path d="M15.3 11 C17.4 11 17.4 14.4 15.3 14.4" /><path d="M5.5 18.5 L18.5 5.5" /></>,
    nutFree:      <><path d="M12 4 C8.5 7.5 8.5 16 12 19.5 C15.5 16 15.5 7.5 12 4 Z" /><path d="M12 6 V17.5" /><path d="M5.5 18.5 L18.5 5.5" /></>,
    soyFree:      <><path d="M6.5 17.5 C5 11.5 9.5 6.5 17 7 C18.5 13 14 18 6.5 17.5 Z" /><circle className="seed" cx="10.5" cy="13" r="1" /><circle className="seed" cx="13.5" cy="11" r="1" /><path d="M5.5 18.5 L18.5 5.5" /></>,

    // ── Food categories (for ingredient filter pills, future use) ──
    fruit:     <><path d="M12 8 C9.5 6.2 5 7 5 12.2 C5 17 8 20.5 12 19.6 C16 20.5 19 17 19 12.2 C19 7 14.5 6.2 12 8 Z" /><path d="M12 8 V5 C12 3.5 13.6 3 15 3.6" /><path d="M12 5.4 C13.4 4 15.6 4 16.8 5.4" /></>,
    berry:     <><circle cx="7.5" cy="17" r="3" /><circle cx="16" cy="16" r="3" /><path d="M7.5 14 C9 9.5 12.5 5.5 16 4 M16 13 C16 9 15.8 6 16 4" /><path d="M16 4 C17.5 3 19.6 3.6 20 5.8" /></>,
    veg:       <><path d="M6.6 12.4 A2.4 2.4 0 0 1 7.2 8.4 A2.8 2.8 0 0 1 12 6.6 A2.8 2.8 0 0 1 16.8 8.4 A2.4 2.4 0 0 1 17.4 12.4 A2.6 2.6 0 0 1 14.8 14.4 H9.2 A2.6 2.6 0 0 1 6.6 12.4 Z" /><path d="M10 14.2 V18 A2 2 0 0 0 14 18 V14.2" /><path d="M12 7.2 V13.6 M9.3 9 V13.6 M14.7 9 V13.6" /></>,
    fish:      <><path d="M3 12 C6 8 11 8 15 12 C11 16 6 16 3 12 Z" /><path d="M15 12 L20.5 8 V16 L15 12 Z" /><circle className="seed" cx="6.6" cy="11.4" r=".8" /></>,
    mushroom:  <><path d="M4.5 11.5 A7.5 5 0 0 1 19.5 11.5 Z" /><path d="M9.5 11.5 C9.5 15.5 8.5 19 12 21 C15.5 19 14.5 15.5 14.5 11.5" /></>,
    spice:     <><circle cx="9" cy="10.5" r="3.4" /><circle cx="15" cy="11.5" r="3.4" /><circle cx="11.6" cy="16" r="3.4" /><path d="M9 7.1 L9 6 M8.1 7.3 L7.4 6.6 M9.9 7.3 L10.6 6.6" /></>,
    citrus:    <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="6.2" /><path d="M12 5.8 V18.2 M5.8 12 H18.2 M7.6 7.6 L16.4 16.4 M16.4 7.6 L7.6 16.4" /></>,
    grain:     <><path d="M4 13.5 A8 5.5 0 0 1 20 13.5 V18 H4 Z" /><path d="M9 9.5 V18 M14 9.5 V18" /></>,
    dairy:     <><path d="M9 8.5 L8.5 18 A2 2 0 0 0 10.5 20 H13.5 A2 2 0 0 0 15.5 18 L15 8.5 Z" /><path d="M8.7 8.5 H15.3" /><path d="M9 8.5 C9 6.9 10 6.3 11.2 6.6" /><path d="M15.3 11 C17.4 11 17.4 14.4 15.3 14.4" /><path d="M9.3 13 H14.7" /></>,

    // ── Standalone loader (always spinning) ──
    loader:    <path className="spin" d="M6 20 C6 12 9 7 14 7 C17 7 18.4 9.8 16.6 11.4 C15.2 12.6 13.6 11.6 14 9.8" />,

    // ── AI mark (rendered in --accent-cool by surrounding btn) ──
    sparkle:   <path d="M12 4v5m0 6v5m-8-8h5m6 0h5M6.3 6.3l3.5 3.5m4.4 4.4 3.5 3.5M6.3 17.7l3.5-3.5m4.4-4.4 3.5-3.5" />,

    // ── System / utility (kept simple, no botanical reframing) ──
    check:     <path d="m5 12 5 5L20 7" />,
    x:         <path d="M6 6l12 12M6 18 18 6" />,
    chevR:     <path d="m9 6 6 6-6 6" />,
    chevL:     <path d="m15 6-6 6 6 6" />,
    chevD:     <path d="m6 9 6 6 6-6" />,
    chevU:     <path d="m6 15 6-6 6 6" />,
    minus:     <path d="M5 12h14" />,
    play:      <path d="M7 5v14l12-7L7 5Z" />,
    copy:      <path d="M9 9h11v11H9zM5 5h11v3M5 15V5" />,
    download:  <path d="M12 4v12m0 0-5-5m5 5 5-5M4 21h16" />,
    link:      <path d="M10 14a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L11.83 5.17M14 10a5 5 0 0 0-7.07 0L3.39 13.54a5 5 0 0 0 7.07 7.07L12.17 18.83" />,
    file:      <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6" /></>,
    image:     <><path d="M4 4h16v16H4z" /><path d="M4 16l5-5 5 5 3-3 3 3" /><path d="M14 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></>,
    list:      <path d="M4 6h16M4 12h16M4 18h16" />,
    pin:       <><path d="M12 21V14" /><path d="M8 4h8l-1.5 6a3 3 0 0 1-2 2H11.5a3 3 0 0 1-2-2L8 4Z" /></>,

    // ── Backwards-compat aliases (old name → new glyph) ──
    bookmark:  <><path d="M7 4 H17 V20 L12 16 L7 20 Z" /><path d="M12 8 C10.6 8 9.6 9 9.6 10.4 C11 10.4 12 9.4 12 8 Z" /></>,
    bowl:      <path d="M3 11h18l-1 4a4 4 0 0 1-4 3H8a4 4 0 0 1-4-3l-1-4Z M9 8c0-2 1-4 3-4s3 2 3 4" />,
    camera:    <><path d="M4 8.5 H7 L8.5 6 H15.5 L17 8.5 H20 V19 H4 Z" /><circle cx="12" cy="13.2" r="3.4" /></>,
    paperclip: <path d="M9 7 V16 A3 3 0 0 0 15 16 V6 A2 2 0 0 0 11 6 V15 A1 1 0 0 0 13 15 V8" />,
    clock:     <><circle cx="12" cy="13.7" r="7.4" /><path className="sweep" d="M12 13.7 V8.4" /><path d="M9.6 3 H14.4 M12 3 V5.6" /></>,
    heart:     <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" />,
    heartFill: <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" fill="currentColor" />,
    star:      <path d="m12 3 2.6 6 6.4.6-4.8 4.4 1.4 6.4L12 17l-5.6 3.4 1.4-6.4L3 9.6 9.4 9 12 3Z" />,
    starFill:  <path d="m12 3 2.6 6 6.4.6-4.8 4.4 1.4 6.4L12 17l-5.6 3.4 1.4-6.4L3 9.6 9.4 9 12 3Z" fill="currentColor" />,
    tomato:    <><path d="M12 8.5 C7.5 8.5 5.5 12 5.5 14.8 A6.5 6.3 0 0 0 18.5 14.8 C18.5 12 16.5 8.5 12 8.5 Z" /><path d="M12 8.5 V5.6" /><path d="M12 8 C10.2 8 8.8 7 8.2 5.4 C10 5.4 11.3 6.4 12 8 Z" /><path d="M12 8 C13.8 8 15.2 7 15.8 5.4 C14 5.4 12.7 6.4 12 8 Z" /><path d="M12 8 C11.4 6.4 11.4 4.8 12 3.8 C12.6 4.8 12.6 6.4 12 8 Z" /></>,
    sprout:    <><path d="M12 21 V11" /><path d="M12 13 C12 9 9 6 4.5 6 C4.5 10.5 7.5 13 12 13 Z" /><path d="M12 11 C12 7.6 14.8 5 19.5 5 C19.5 9 16.6 11 12 11 Z" /></>,
    // Static beaker for the origin-tag badge use (no bubbles).
    beaker:    <><path d="M9.8 4.5 H14.2" /><path d="M10.2 4.5 V9.5 L6.6 17.3 A2.2 2.2 0 0 0 8.6 20.2 H15.4 A2.2 2.2 0 0 0 17.4 17.3 L13.8 9.5 V4.5" /><path d="M8.5 14 H15.5" /><circle className="seed" cx="10.8" cy="17" r="0.8" /><circle className="seed" cx="13" cy="16.2" r="0.7" /><circle className="seed" cx="11.8" cy="18.4" r="0.6" /></>,
    serving:   <path d="M3 14h18 M5 14a7 7 0 0 1 14 0 M12 4v3" />,
    grid2:     <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
         data-icon={name}>
      {paths[name]}
    </svg>
  );
};

// Pill component
export const Pill = ({ children, kind = "", onClick, removable }) => (
  <span className={`pill ${kind}`} onClick={onClick}>
    {children}
    {removable && <span className="x" onClick={onClick}><Icon name="x" size={10} /></span>}
  </span>
);

