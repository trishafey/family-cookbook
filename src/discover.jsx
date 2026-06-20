// Discover — public-cookbook directory. Lets cooks find other
// families' cookbooks (when those families have opted to make
// theirs public), browse them as guests, and request to join.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./helpers.jsx";
import { LANG_META } from "./i18n.js";

const FLAG_SRC = {
  en:   "/images/flags/en.png",
  enUS: "/images/flags/en-us.svg",
  pl:   "/images/flags/pl.jpg",
  es:   "/images/flags/es.png",
  el:   "/images/flags/el.jpg",
  pt:   "/images/flags/pt.png",
  fil:  "/images/flags/fil.svg",
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

const COOKBOOK_TYPE_LABEL = {
  "family-heirloom": "Family heirloom",
  "personal": "Personal",
  "group": "Group",
};

function DiscoverFollowButton({ cookbookId, alreadyFollowing }) {
  const [state, setState] = useState(alreadyFollowing ? "following" : "idle");
  const send = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch(`/api/admin/cookbooks/${encodeURIComponent(cookbookId)}/follow`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setState(res.ok ? "following" : "error");
    } catch {
      setState("error");
    }
  };
  if (state === "following") {
    return <span className="discover-follow following"><Icon name="check" size={12} /> Following</span>;
  }
  return (
    <button
      type="button"
      className="discover-follow"
      onClick={send}
      disabled={state === "sending"}
    >
      <Icon name="bookmark" size={12} /> {state === "sending" ? "Following…" : "Follow"}
    </button>
  );
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Filter state — empty Set = "show everything"; otherwise the
  // cookbook must match one of the selected values.
  const [cuisineFilter, setCuisineFilter] = useState(new Set());
  const [typeFilter, setTypeFilter] = useState(new Set());

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

  // Available cuisine + type values across the loaded set — used
  // to populate the filter chips so we never show a filter that
  // would return zero results.
  const availableCuisines = useMemo(() => {
    const set = new Set();
    cookbooks.forEach(cb => (cb.languages || []).forEach(code => set.add(code)));
    return [...set];
  }, [cookbooks]);

  const availableTypes = useMemo(() => {
    const set = new Set();
    cookbooks.forEach(cb => { if (cb.cookbookType) set.add(cb.cookbookType); });
    return [...set];
  }, [cookbooks]);

  const filtered = useMemo(() => cookbooks.filter(cb => {
    if (cuisineFilter.size && !(cb.languages || []).some(c => cuisineFilter.has(c))) return false;
    if (typeFilter.size && !typeFilter.has(cb.cookbookType)) return false;
    return true;
  }), [cookbooks, cuisineFilter, typeFilter]);

  const totalFilterCount = cuisineFilter.size + typeFilter.size;
  const toggleSet = (setter) => (val) => setter(prev => {
    const next = new Set(prev);
    if (next.has(val)) next.delete(val); else next.add(val);
    return next;
  });
  const toggleCuisine = toggleSet(setCuisineFilter);
  const toggleType = toggleSet(setTypeFilter);
  const clearFilters = () => { setCuisineFilter(new Set()); setTypeFilter(new Set()); };

  return (
    <div className="discover-page" data-screen-label="Discover">
      <div className="page-header">
        <div className="eyebrow">Cookbooks shared by other cooks</div>
        <h1><em>Other families&rsquo;</em> cookbooks</h1>
        <div className="intro">
          Family cookbooks people have made public. Open one to read along, save recipes to your own library, or follow it for new posts.
        </div>
      </div>

      <div className="cookbook-search discover-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          className="cookbook-search-input"
          placeholder="Search by cookbook, cook, or blurb…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="cookbook-search-close"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <Icon name="x" size={14} />
          </button>
        )}
        <button
          type="button"
          className="cookbook-search-filter"
          onClick={() => setFiltersOpen(o => !o)}
          aria-label="Filters"
          title="Filters"
        >
          <Icon name="filter" size={15} />
          {totalFilterCount > 0 && <span className="count">{totalFilterCount}</span>}
        </button>
      </div>

      {filtersOpen && (
        <div className="discover-filters">
          <div className="filter-group">
            <div className="filter-label">Cuisine</div>
            <div className="filter-chips">
              {availableCuisines.length === 0 && <span className="filter-empty">No cuisines yet.</span>}
              {availableCuisines.map(code => (
                <button
                  key={code}
                  type="button"
                  className={`filter-pill ${cuisineFilter.has(code) ? "on" : ""}`}
                  onClick={() => toggleCuisine(code)}
                >
                  {LANG_NATIONALITY[code] || LANG_META[code]?.label || code}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <div className="filter-label">Cookbook type</div>
            <div className="filter-chips">
              {availableTypes.length === 0 && <span className="filter-empty">Owners haven't set types yet.</span>}
              {availableTypes.map(t => (
                <button
                  key={t}
                  type="button"
                  className={`filter-pill ${typeFilter.has(t) ? "on" : ""}`}
                  onClick={() => toggleType(t)}
                >
                  {COOKBOOK_TYPE_LABEL[t] || t}
                </button>
              ))}
            </div>
          </div>
          {totalFilterCount > 0 && (
            <button type="button" className="btn ghost sm" onClick={clearFilters}>Clear filters</button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: 32, color: "var(--ink-3)" }}>Loading public cookbooks…</div>
      ) : error ? (
        <div className="cookbooks-empty" style={{ color: "#933" }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div className="discover-empty">
          <p>
            {query || totalFilterCount > 0
              ? `No public cookbooks match your filters.`
              : "No public cookbooks yet. When other cooks make their cookbooks public, they'll show up here."}
          </p>
        </div>
      ) : (
        <div className="discover-grid">
          {filtered.map(cb => {
            const languages = cb.languages || ["en"];
            const langLine = languages.map(c => LANG_NATIONALITY[c] || c).join(" · ");
            return (
              <div
                key={cb.id}
                className="discover-card"
                role="button"
                tabIndex={0}
                onClick={() => onOpenCookbook?.(cb)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenCookbook?.(cb); } }}
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
                    <div className="discover-actions">
                      <DiscoverFollowButton cookbookId={cb.id} alreadyFollowing={false} />
                      <DiscoverJoinButton cookbookId={cb.id} alreadyRequested={cb.pendingJoin} />
                    </div>
                  )}
                  {cb.yourRole === "viewer" && (
                    <div className="discover-actions">
                      <span className="discover-follow following"><Icon name="check" size={12} /> Following</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
