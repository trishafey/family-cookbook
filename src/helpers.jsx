// Shared utilities & primitives for the cookbook.

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

// ───── Math / formatting ─────

// Render a fractional quantity nicely. 0.5 → "½", 1.25 → "1¼"
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
// Given a list of steps with mins and optional `hands` (overlap), and a finish
// Date, return [{startTime, endTime}] for each step. Steps run sequentially —
// a long simmer counts toward finish but the hands-on subset is what you do.
export function scheduleForFinish(steps, finishTime) {
  const totalMin = steps.reduce((s, x) => s + (x.mins || 0), 0);
  let cursor = new Date(finishTime);
  const out = new Array(steps.length);
  for (let i = steps.length - 1; i >= 0; i--) {
    const end = new Date(cursor);
    const start = new Date(cursor.getTime() - (steps[i].mins || 0) * 60000);
    out[i] = { start, end };
    cursor = start;
  }
  return { schedule: out, totalMin, startTime: cursor };
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

// Backfill defaults for fields the UI assumes exist. Older user-added
// recipes can be missing arrays or nested objects; rendering crashes
// rather than degrading without this.
export function normalizeRecipe(r) {
  return {
    ...r,
    diet: r.diet || [],
    tips: r.tips || [],
    comments: r.comments || [],
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

// Build a URL that, when navigated to, will route the user through
// Cloudflare Access (login if needed) and return them to `returnTo`.
export function signInUrl(returnTo) {
  const target = returnTo ?? (window.location.pathname + window.location.search);
  return `/api/admin/login?return=${encodeURIComponent(target)}`;
}

// Cloudflare Access's built-in logout URL — clears the session cookie.
export const SIGN_OUT_URL = "/cdn-cgi/access/logout";

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
  const paths = {
    search:    <path d="M11 19a8 8 0 1 1 5.3-2L21 21M15 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" />,
    plus:      <path d="M12 5v14M5 12h14" />,
    filter:    <path d="M3 6h18M6 12h12M10 18h4" />,
    bookmark:  <path d="M6 4h12v17l-6-4-6 4V4Z" />,
    bookmarkFill: <path d="M6 4h12v17l-6-4-6 4V4Z" fill="currentColor" />,
    heart:     <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" />,
    heartFill: <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" fill="currentColor" />,
    clock:     <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    chef:      <path d="M7 21h10M6 17h12v-2c2 0 4-2 4-4a4 4 0 0 0-5-4 5 5 0 0 0-10 0 4 4 0 0 0-5 4c0 2 2 4 4 4v2Z" />,
    print:     <path d="M7 9V4h10v5M7 18H4v-7h16v7h-3M7 14h10v6H7v-6Z" />,
    download:  <path d="M12 4v12m0 0-5-5m5 5 5-5M4 21h16" />,
    share:     <path d="M16 5l-9 7 9 7M16 5a3 3 0 1 0 0-2M16 19a3 3 0 1 0 0 2M7 12a3 3 0 1 1-2 0" />,
    edit:      <path d="M16 4l4 4-11 11H5v-4L16 4Z" />,
    x:         <path d="M6 6l12 12M6 18 18 6" />,
    chevR:     <path d="m9 6 6 6-6 6" />,
    chevL:     <path d="m15 6-6 6 6 6" />,
    chevD:     <path d="m6 9 6 6 6-6" />,
    sparkle:   <path d="M12 3v6m0 6v6m-9-9h6m6 0h6M5.6 5.6l4.2 4.2m4.4 4.4 4.2 4.2M5.6 18.4l4.2-4.2m4.4-4.4 4.2-4.2" />,
    check:     <path d="m5 12 5 5L20 7" />,
    camera:    <path d="M4 7h3l2-2h6l2 2h3v12H4V7Z M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />,
    link:      <path d="M10 14a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L11.83 5.17M14 10a5 5 0 0 0-7.07 0L3.39 13.54a5 5 0 0 0 7.07 7.07L12.17 18.83" />,
    list:      <path d="M4 6h16M4 12h16M4 18h16" />,
    grid2:     <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
    bowl:      <path d="M3 11h18l-1 4a4 4 0 0 1-4 3H8a4 4 0 0 1-4-3l-1-4Z M9 8c0-2 1-4 3-4s3 2 3 4" />,
    star:      <path d="m12 3 2.6 6 6.4.6-4.8 4.4 1.4 6.4L12 17l-5.6 3.4 1.4-6.4L3 9.6 9.4 9 12 3Z" />,
    starFill:  <path d="m12 3 2.6 6 6.4.6-4.8 4.4 1.4 6.4L12 17l-5.6 3.4 1.4-6.4L3 9.6 9.4 9 12 3Z" fill="currentColor" />,
    minus:     <path d="M5 12h14" />,
    play:      <path d="M7 5v14l12-7L7 5Z" />,
    copy:      <path d="M9 9h11v11H9zM5 5h11v3M5 15V5" />,
    book:      <path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4V4Z M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8V4Z" />,
    serving:   <path d="M3 14h18 M5 14a7 7 0 0 1 14 0 M12 4v3" />,
    paperclip: <path d="M21 11.5 12.5 20a5.5 5.5 0 0 1-7.78-7.78L13 4a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a1.5 1.5 0 1 1-2.12-2.12L14.5 8.2" />,
    file:      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z M14 3v6h6" />,
    image:     <path d="M4 4h16v16H4z M4 16l5-5 5 5 3-3 3 3 M14 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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

