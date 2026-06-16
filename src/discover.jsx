// Discover — browse public cookbooks shared by other cooks.
// Searchable by name / blurb / owner; clicking a card opens
// the cookbook page like any other.

import { useEffect, useState } from "react";
import { Icon } from "./helpers.jsx";
import { LANG_META } from "./i18n.js";

const FLAG_SRC = {
  en: "/images/flags/en.png",
  enUS: "/images/flags/en-us.svg",
  pl: "/images/flags/pl.jpg",
  es: "/images/flags/es.png",
  el: "/images/flags/el.jpg",
  pt: "/images/flags/pt.png",
  fil: "/images/flags/fil.svg",
};

const LANG_NATIONALITY = {
  en: "Canadian",
  enUS: "American",
  pl: "Polish",
  es: "Mexican",
  el: "Greek",
  pt: "Portuguese",
  fil: "Filipino",
};

function coverInitials(name) {
  // Drop emoji + symbols before initialising so the spine of a
  // cookbook like "Wojcik 🌶️🥑🥬" only carries letters.
  const cleaned = (name || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}️]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned
    .split(/\s+/)
    .filter(w => w && !/^(the|a|an|of|&|and)$/i.test(w))
    .map(w => w.replace(/['']s$/i, "")[0] || "")
    .filter(c => /[A-Za-z]/.test(c))
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function DiscoverJoinButton({ cookbookId, alreadyRequested }) {
  const [state, setState] = useState(alreadyRequested ? "sent" : "idle");
  const send = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch(`/api/admin/cookbooks/${encodeURIComponent(cookbookId)}/join-request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  };
  if (state === "sent") {
    return <span className="discover-join requested"><Icon name="check" size={12} /> Requested</span>;
  }
  return (
    <button
      type="button"
      className="discover-join"
      onClick={send}
      disabled={state === "sending"}
    >
      <Icon name="chefAdd" size={12} /> {state === "sending" ? "Sending…" : "Request to join"}
    </button>
  );
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
        const res = await fetch(`/api/admin/discover${query ? `?q=${encodeURIComponent(query)}` : ""}`, { credentials: "include" });
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
      <div className="page-header">
        <div className="eyebrow">Cookbooks shared by other cooks</div>
        <h1><em>Other families&rsquo;</em> cookbooks</h1>
        <div className="intro">
          Family cookbooks people have made public. Open one to read along, save recipes to your own library, or follow it for new posts.
        </div>
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
            const languages = cb.languages || ["en"];
            const langLine = languages.map(c => LANG_NATIONALITY[c] || c).join(" · ");
            return (
              <button
                key={cb.id}
                type="button"
                className="discover-card"
                onClick={() => onOpenCookbook?.(cb)}
              >
                <div
                  className={`discover-cover ${cb.coverPhoto ? "has-photo" : ""}`}
                  style={cb.coverColor ? { "--book-color": cb.coverColor } : undefined}
                >
                  {cb.coverPhoto && (
                    <img className="book-cover-photo" src={cb.coverPhoto} alt="" />
                  )}
                  <span className="discover-cover-content">
                    {langLine && <span className="discover-cover-langs">{langLine}</span>}
                    <span className="discover-cover-title">{cb.name}</span>
                  </span>
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
                  {!cb.yourRole && (
                    <DiscoverJoinButton cookbookId={cb.id} alreadyRequested={cb.pendingJoin} />
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
