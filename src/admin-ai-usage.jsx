// AI usage analytics — small admin dashboard. Reads
// /api/admin/ai-usage which returns four datasets the worker
// pulls from the ai_events table (instrumentation lives at each
// AI endpoint's success path).
//
// Intentionally simple — CSS-bar charts, plain tables, no chart
// libraries. Goal is fast-loading family-visible insight, not a
// production analytics surface.

import { useState, useEffect } from "react";
import { Icon } from "./helpers.jsx";

const FEATURE_LABELS = {
  "extract-text":   "Add Recipe · paste text",
  "extract-url":    "Add Recipe · paste URL",
  "extract-image":  "Add Recipe · photo of card",
  "pairings":       "Goes great with…",
  "help":           "Need help (Q&A)",
  "adjust":         "Adjust with AI",
  "adjust-chips":   "Adjust · chip suggestions",
  "family-says":    "Family says (summary)",
  "lab-iterate":    "Lab · iterate",
  "lab-suggest":    "Lab · what to try next",
  "lab-promote":    "Lab · polish for cookbook",
  "nutrition":      "Nutrition estimate",
  "hero-image":     "Generate hero photo",
};

const ADD_METHOD_LABELS = {
  "paste-text":  "Paste text",
  "paste-url":   "Paste URL",
  "paste-image": "Photo of recipe",
  "manual":      "Typed by hand",
};

const SHOPPING_ACTION_LABELS = {
  "copy":     "Copy to clipboard",
  "download": "Download .txt",
  "print":    "Print",
};

const FEATURE_USAGE_LABELS = {
  "cook-mode-start":   "Cook mode",
  "meal-plan-open":    "Meal plan",
  "build-a-meal-open": "Build a meal",
};

const FILTER_KEY_LABELS = {
  courses: "Course",
  diets: "Diet",
  occasions: "Occasion",
  authors: "Cook",
  cuisines: "Cuisine",
  difficulties: "Difficulty",
  maxTime: "Max time",
};

function featureLabel(key) {
  return FEATURE_LABELS[key] || key;
}

// OpenAI list prices in USD per 1M tokens. The API returns versioned
// model strings (e.g. "gpt-4o-mini-2024-07-18"), so we match by prefix.
// Update when OpenAI changes pricing.
const PRICE_PER_M = {
  "gpt-4o-mini": { in: 0.15, out: 0.60 },
  "gpt-4o":      { in: 2.50, out: 10.00 },
};
// gpt-image-1 standard 1024x1024. We don't surface size yet so this
// is the assumed-for-all-images rate.
const IMAGE_PRICE_USD = 0.04;

function priceFor(model) {
  if (!model) return null;
  for (const key of Object.keys(PRICE_PER_M)) {
    if (model.startsWith(key)) return PRICE_PER_M[key];
  }
  return null;
}

function estimateCostUsd(tokenTotals, imageCalls) {
  let usd = 0;
  for (const row of tokenTotals || []) {
    const price = priceFor(row.model);
    if (!price) continue;
    usd += (row.prompt_tokens || 0) * price.in / 1_000_000;
    usd += (row.completion_tokens || 0) * price.out / 1_000_000;
  }
  usd += (imageCalls || 0) * IMAGE_PRICE_USD;
  return usd;
}

function fmtTokens(n) {
  if (!n) return "0";
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtUsd(usd) {
  if (usd <= 0) return "$0.00";
  if (usd < 0.005) return "< $0.01";
  if (usd < 0.50) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 500, marginTop: 2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>{sub}</div>
      )}
    </div>
  );
}

// Format an ISO timestamp into "Jan 12, 3:14 pm" — local time.
function fmtTs(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Render meta JSON as a short human-readable summary per feature.
// Picks the 2-3 fields that matter for scanning the feed.
function summariseMeta(feature, metaStr) {
  if (!metaStr) return "";
  let m;
  try { m = JSON.parse(metaStr); } catch { return ""; }
  const bits = [];
  if (m.title) bits.push(`"${m.title}"`);
  if (m.prompt) bits.push(`prompt: ${String(m.prompt).slice(0, 80)}`);
  if (m.actionKind && m.actionKind !== "none") {
    bits.push(`action: ${m.actionKind}${m.actionValue != null ? ` = ${m.actionValue}` : ""}`);
  }
  if (m.hostname) bits.push(m.hostname);
  if (m.photoCount) bits.push(`${m.photoCount} photos`);
  if (m.chipCount) bits.push(`${m.chipCount} chips`);
  if (m.tweakCount) bits.push(`${m.tweakCount} tweaks`);
  if (m.suggestionCount) bits.push(`${m.suggestionCount} suggestions`);
  if (m.tastingNoteCount) bits.push(`${m.tastingNoteCount} tasting notes`);
  if (m.iterationCount) bits.push(`iteration ${m.iterationCount}`);
  if (m.diff) bits.push(`diff: ${String(m.diff).slice(0, 60)}`);
  if (m.cal != null) bits.push(`${m.cal} cal`);
  return bits.join(" · ");
}

export function AdminAIUsage({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [includeAdmins, setIncludeAdmins] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/admin/ai-usage${includeAdmins ? "?includeAdmins=1" : ""}`;
        const res = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`Load failed (${res.status})`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load usage data.");
      }
    })();
    return () => { cancelled = true; };
  }, [includeAdmins]);

  const totalCalls = (data?.featureTotals || []).reduce((a, b) => a + (b.n || 0), 0);
  const maxFeatureN = Math.max(1, ...(data?.featureTotals || []).map(r => r.n || 0));
  const maxUserN    = Math.max(1, ...(data?.userTotals || []).map(r => r.n || 0));
  const totalTokens = (data?.tokenTotals || []).reduce(
    (a, r) => a + (r.prompt_tokens || 0) + (r.completion_tokens || 0), 0,
  );
  const estCostUsd = estimateCostUsd(data?.tokenTotals, data?.imageCalls);

  const maxViewN     = Math.max(1, ...(data?.viewTotals || []).map(r => r.n || 0));
  const maxAddN      = Math.max(1, ...(data?.addMethodTotals || []).map(r => r.n || 0));
  const maxShoppingN = Math.max(1, ...(data?.shoppingActionTotals || []).map(r => r.n || 0));
  const totalAdds = (data?.addMethodTotals || []).reduce((a, b) => a + (b.n || 0), 0);
  const totalViews = (data?.viewTotals || []).reduce((a, b) => a + (b.n || 0), 0);
  const totalShopping = (data?.shoppingActionTotals || []).reduce((a, b) => a + (b.n || 0), 0);

  const maxFeatureUsageN = Math.max(1, ...(data?.featureUsage || []).map(r => r.n || 0));
  const maxCookN     = Math.max(1, ...(data?.cookModeTopRecipes || []).map(r => r.n || 0));
  const maxSearchN   = Math.max(1, ...(data?.topSearches || []).map(r => r.n || 0));
  const maxFilterN   = Math.max(1, ...(data?.filterUsage || []).map(r => r.n || 0));

  const cookFinishes = data?.cookModeCompletion?.finishes || 0;
  const cookCompleted = data?.cookModeCompletion?.completed || 0;
  const cookCompletionPct = cookFinishes > 0 ? Math.round((cookCompleted / cookFinishes) * 100) : null;

  const funnel = data?.funnel || {};
  const funnelAdded = funnel.total_added || 0;
  const stickPct = funnelAdded > 0 ? Math.round((funnel.viewed_twice / funnelAdded) * 100) : null;
  const cookedPct = funnelAdded > 0 ? Math.round((funnel.cooked / funnelAdded) * 100) : null;

  return (
    <div className="app admin-ai-usage" data-screen-label="Admin · AI usage">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 24 }}>
        <Icon name="chevL" /> Back to cookbook
      </button>

      <header style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent-cool)", marginBottom: 6 }}>
          Admin
        </div>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, fontStyle: "italic", fontWeight: 500, margin: 0 }}>
          Usage analytics
        </h1>
        <p style={{ color: "var(--ink-3)", fontFamily: "var(--serif)", fontSize: 15, marginTop: 8 }}>
          {totalCalls > 0
            ? `${totalCalls} AI ${totalCalls === 1 ? "call" : "calls"} · ${fmtTokens(totalTokens)} tokens · est. ${fmtUsd(estCostUsd)}`
            : "No usage data yet. Once the family uses an AI feature it'll show up here."}
        </p>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, color: "var(--ink-2)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={includeAdmins}
            onChange={(e) => setIncludeAdmins(e.target.checked)}
          />
          Include admin activity in user-behaviour stats
          <span style={{ color: "var(--ink-3)", fontSize: 12 }}>
            (always included in AI cost above)
          </span>
        </label>
      </header>

      {error && (
        <div style={{ padding: 12, background: "rgba(180,40,40,.06)", border: "1px solid rgba(180,40,40,.2)", borderRadius: 8, marginBottom: 24, color: "#933", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!data && !error && (
        <div style={{ color: "var(--ink-3)", fontStyle: "italic" }}>Loading…</div>
      )}

      {data && (
        <div style={{ display: "grid", gap: 32 }}>
          {/* Feature popularity */}
          <section>
            <h2 className="admin-ai-h2">Most popular features</h2>
            {data.featureTotals.length === 0 && (
              <div className="admin-ai-empty">Nothing yet.</div>
            )}
            <div className="admin-ai-bars">
              {data.featureTotals.map((row) => (
                <div className="row" key={row.feature}>
                  <div className="label">{featureLabel(row.feature)}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(row.n / maxFeatureN) * 100}%` }} />
                  </div>
                  <div className="n">{row.n}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Per-user totals */}
          <section>
            <h2 className="admin-ai-h2">Per cook</h2>
            {data.userTotals.length === 0 && (
              <div className="admin-ai-empty">Nothing yet.</div>
            )}
            <div className="admin-ai-bars">
              {data.userTotals.map((row) => (
                <div className="row" key={row.user_email}>
                  <div className="label">{row.user_email}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(row.n / maxUserN) * 100}%` }} />
                  </div>
                  <div className="n">
                    {row.n}
                    {row.tokens > 0 && (
                      <span style={{ color: "var(--ink-3)", fontWeight: 400, marginLeft: 8 }}>
                        {fmtTokens(row.tokens)} tok
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent free-text prompts */}
          <section>
            <h2 className="admin-ai-h2">What people are typing</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
              Last 20 free-text prompts from Adjust, Need Help, and Lab iterate.
            </div>
            {data.recentPrompts.length === 0 && (
              <div className="admin-ai-empty">No free-text prompts yet.</div>
            )}
            <div className="admin-ai-table-wrap">
              <table className="admin-ai-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Feature</th>
                    <th>Prompt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPrompts.map((row, i) => (
                    <tr key={i}>
                      <td className="ts">{fmtTs(row.created_at)}</td>
                      <td>{row.user_email}</td>
                      <td>{featureLabel(row.feature)}</td>
                      <td className="prompt">{row.prompt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Recent activity feed */}
          <section>
            <h2 className="admin-ai-h2">Recent activity</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
              Last 50 AI calls, newest first.
            </div>
            {data.recentEvents.length === 0 && (
              <div className="admin-ai-empty">No activity yet.</div>
            )}
            <div className="admin-ai-table-wrap">
              <table className="admin-ai-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Feature</th>
                    <th>Recipe</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentEvents.map((row, i) => (
                    <tr key={i}>
                      <td className="ts">{fmtTs(row.created_at)}</td>
                      <td>{row.user_email}</td>
                      <td>{featureLabel(row.feature)}</td>
                      <td>{row.recipe_id || ""}</td>
                      <td className="meta">{summariseMeta(row.feature, row.meta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section break — switch from AI cost analytics to user behaviour. */}
          <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 8 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent-cool)" }}>
              How people are using the cookbook
            </div>
            <p style={{ color: "var(--ink-3)", fontFamily: "var(--serif)", fontSize: 14, marginTop: 6 }}>
              {totalViews + totalAdds + totalShopping > 0
                ? `${totalViews} ${totalViews === 1 ? "view" : "views"} · ${totalAdds} ${totalAdds === 1 ? "recipe added" : "recipes added"} · ${totalShopping} shopping list ${totalShopping === 1 ? "action" : "actions"}${includeAdmins ? "" : " · admins excluded"}.`
                : "No user activity captured yet — once people start using the cookbook it'll show up here."}
            </p>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 12, fontSize: 13, color: "var(--ink-2)" }}>
              <Stat label="Active this week" value={`${data.weeklyActive ?? 0}`} />
              <Stat label="Returning vs prior week" value={`${data.returningUsers ?? 0}`} />
              {stickPct != null && <Stat label="Added recipes viewed 2+ times" value={`${stickPct}%`} />}
              {cookedPct != null && <Stat label="Added recipes ever cooked" value={`${cookedPct}%`} />}
              {cookCompletionPct != null && <Stat label="Cook-mode completion" value={`${cookCompletionPct}%`} sub={`${cookFinishes} ${cookFinishes === 1 ? "session" : "sessions"}`} />}
            </div>
          </div>

          {/* Feature usage */}
          <section>
            <h2 className="admin-ai-h2">Feature usage</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
              How often each surface gets opened.
            </div>
            {data.featureUsage?.length ? (
              <div className="admin-ai-bars">
                {data.featureUsage.map((row) => (
                  <div className="row" key={row.event}>
                    <div className="label">{FEATURE_USAGE_LABELS[row.event] || row.event}</div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(row.n / maxFeatureUsageN) * 100}%` }} />
                    </div>
                    <div className="n">{row.n}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-ai-empty">Nothing yet.</div>
            )}
          </section>

          {/* Most-viewed recipes */}
          <section>
            <h2 className="admin-ai-h2">Most-viewed recipes</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
              Top 10, all-time.
            </div>
            {data.viewTotals?.length ? (
              <div className="admin-ai-bars">
                {data.viewTotals.map((row) => (
                  <div className="row" key={row.recipe_id}>
                    <div className="label">{row.title || row.recipe_id}</div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(row.n / maxViewN) * 100}%` }} />
                    </div>
                    <div className="n">{row.n}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-ai-empty">No views logged yet.</div>
            )}
          </section>

          {/* Most-cooked recipes — cook-mode sessions are a stronger
              signal than views (someone went into cooking mode = they
              actually planned to make it). */}
          <section>
            <h2 className="admin-ai-h2">Most-cooked recipes</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
              Top 10 by cook-mode sessions started.
            </div>
            {data.cookModeTopRecipes?.length ? (
              <div className="admin-ai-bars">
                {data.cookModeTopRecipes.map((row) => (
                  <div className="row" key={row.recipe_id}>
                    <div className="label">{row.title || row.recipe_id}</div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(row.n / maxCookN) * 100}%` }} />
                    </div>
                    <div className="n">{row.n}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-ai-empty">No cook-mode sessions yet.</div>
            )}
          </section>

          {/* What people search for */}
          <section>
            <h2 className="admin-ai-h2">What people search for</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
              Top 20 search queries, lower-cased and grouped.
            </div>
            {data.topSearches?.length ? (
              <div className="admin-ai-bars">
                {data.topSearches.map((row) => (
                  <div className="row" key={row.query}>
                    <div className="label">"{row.query}"</div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(row.n / maxSearchN) * 100}%` }} />
                    </div>
                    <div className="n">{row.n}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-ai-empty">No searches logged yet.</div>
            )}
          </section>

          {/* Filters used — answers "which slices of the cookbook get
              browsed most often." */}
          <section>
            <h2 className="admin-ai-h2">Filters used</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
              Each row counts how often a particular filter value got selected.
            </div>
            {data.filterUsage?.length ? (
              <div className="admin-ai-bars">
                {data.filterUsage.map((row, i) => (
                  <div className="row" key={`${row.filter_key}-${row.filter_value}-${i}`}>
                    <div className="label">
                      <span style={{ color: "var(--ink-3)" }}>{FILTER_KEY_LABELS[row.filter_key] || row.filter_key}:</span>{" "}
                      {row.filter_value}
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(row.n / maxFilterN) * 100}%` }} />
                    </div>
                    <div className="n">{row.n}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-ai-empty">No filters applied yet.</div>
            )}
          </section>

          {/* How recipes get added */}
          <section>
            <h2 className="admin-ai-h2">How recipes get added</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
              Which entry path cooks prefer when adding a new recipe.
            </div>
            {data.addMethodTotals?.length ? (
              <div className="admin-ai-bars">
                {data.addMethodTotals.map((row) => (
                  <div className="row" key={row.method}>
                    <div className="label">{ADD_METHOD_LABELS[row.method] || row.method}</div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(row.n / maxAddN) * 100}%` }} />
                    </div>
                    <div className="n">{row.n}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-ai-empty">No recipes added yet.</div>
            )}
          </section>

          {/* Shopping list actions */}
          <section>
            <h2 className="admin-ai-h2">Shopping list actions</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
              What people do with the shopping list once it's generated.
            </div>
            {data.shoppingActionTotals?.length ? (
              <div className="admin-ai-bars">
                {data.shoppingActionTotals.map((row) => (
                  <div className="row" key={row.action}>
                    <div className="label">{SHOPPING_ACTION_LABELS[row.action] || row.action}</div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(row.n / maxShoppingN) * 100}%` }} />
                    </div>
                    <div className="n">{row.n}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-ai-empty">No shopping list actions yet.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
