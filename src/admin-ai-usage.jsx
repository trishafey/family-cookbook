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

function featureLabel(key) {
  return FEATURE_LABELS[key] || key;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/ai-usage", {
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
  }, []);

  const totalCalls = (data?.featureTotals || []).reduce((a, b) => a + (b.n || 0), 0);
  const maxFeatureN = Math.max(1, ...(data?.featureTotals || []).map(r => r.n || 0));
  const maxUserN    = Math.max(1, ...(data?.userTotals || []).map(r => r.n || 0));

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
          AI usage
        </h1>
        <p style={{ color: "var(--ink-3)", fontFamily: "var(--serif)", fontSize: 15, marginTop: 8 }}>
          {totalCalls > 0
            ? `${totalCalls} AI calls logged across all features.`
            : "No usage data yet. Once the family uses an AI feature it'll show up here."}
        </p>
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
                  <div className="n">{row.n}</div>
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
          </section>
        </div>
      )}
    </div>
  );
}
