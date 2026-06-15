// Discover — browse public cookbooks shared by other cooks.
// Searchable by name / blurb / owner; clicking a card opens
// the cookbook page like any other.

import { useEffect, useState } from "react";
import { Icon } from "./helpers.jsx";
import { LANG_META } from "./i18n.js";

const FLAG_SRC = {
  en: "/images/flags/en.png",
  pl: "/images/flags/pl.jpg",
  es: "/images/flags/es.png",
  el: "/images/flags/el.jpg",
  pt: "/images/flags/pt.png",
};

function coverInitials(name) {
  return (name || "")
    .split(/\s+/)
    .filter(w => w && !/^(the|a|an|of|&|and)$/i.test(w))
    .map(w => w.replace(/['']s$/i, "")[0] || "")
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export function Discover({ onOpenCookbook, onClose }) {
  const [cookbooks, setCookbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const res = await fetch(`/api/admin/cookbooks/public${query ? `?q=${encodeURIComponent(query)}` : ""}`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setCookbooks(data.cookbooks || []);
      } catch (err) {
        if (!cancelled) setError("Could not load public cookbooks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [query]);

  return (
    <div className="discover-page" data-screen-label="Discover">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back
      </button>

      <div className="discover-header">
        <div className="eyebrow">Cookbooks shared by other cooks</div>
        <h1>Discover</h1>
        <p className="discover-tagline">
          Family cookbooks people have made public. Open one to read along, save recipes to your own library, or follow it for new posts.
        </p>
      </div>

      <div className="discover-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          className="discover-search-input"
          placeholder="Search by cookbook, cook, or blurb…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="btn ghost icon-only" onClick={() => setQuery("")}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ marginTop: 32, color: "var(--ink-3)" }}>Loading public cookbooks…</div>
      ) : error ? (
        <div className="cookbooks-empty" style={{ color: "#933" }}>{error}</div>
      ) : cookbooks.length === 0 ? (
        <div className="discover-empty">
          <p>
            {query
              ? `No public cookbooks match "${query}".`
              : "No public cookbooks yet. When other cooks make their cookbooks public, they'll show up here."}
          </p>
        </div>
      ) : (
        <div className="discover-grid">
          {cookbooks.map(cb => {
            const initials = coverInitials(cb.name);
            const languages = cb.languages || ["en"];
            return (
              <button
                key={cb.id}
                type="button"
                className="discover-card"
                onClick={() => onOpenCookbook?.(cb)}
              >
                <div
                  className={`discover-cover ${cb.coverPhoto ? "has-photo" : ""}`}
                  style={{
                    backgroundColor: cb.coverColor || undefined,
                    backgroundImage: cb.coverPhoto ? `url(${cb.coverPhoto})` : undefined,
                  }}
                >
                  {!cb.coverPhoto && <span className="initials">{initials || "·"}</span>}
                </div>
                <div className="discover-card-body">
                  <h3 className="discover-card-name">{cb.name}</h3>
                  {cb.blurb && <p className="discover-card-blurb">{cb.blurb}</p>}
                  <div className="discover-card-meta">
                    <span>{cb.recipeCount} {cb.recipeCount === 1 ? "recipe" : "recipes"}</span>
                    <span>·</span>
                    <span>{cb.memberCount} {cb.memberCount === 1 ? "cook" : "cooks"}</span>
                    <span className="lang-row">
                      {languages.map(code => (
                        <img
                          key={code}
                          src={FLAG_SRC[code] || FLAG_SRC.en}
                          alt={LANG_META[code]?.label || code}
                          title={LANG_META[code]?.label || code}
                          className="discover-flag"
                        />
                      ))}
                    </span>
                  </div>
                  {cb.ownerName && (
                    <div className="discover-card-owner">
                      by {cb.ownerName}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
