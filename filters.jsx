// Filters drawer

const { useState } = React;

function FiltersDrawer({ open, onClose, filters, setFilters }) {
  const toggle = (k, v) => {
    setFilters(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Filter the cookbook"
      footer={
        <>
          <button className="btn ghost" onClick={() => setFilters({ courses: [], diets: [], occasions: [], authors: [], cuisines: [], difficulties: [], maxTime: 0 })}>
            Clear all
          </button>
          <button className="btn primary" onClick={onClose}>Show results</button>
        </>
      }
    >
      <div className="drawer-section">
        <h4>Course</h4>
        <div className="pills">
          {window.COURSES.map(c => (
            <button key={c} className={`filter-pill ${filters.courses.includes(c) ? "on" : ""}`} onClick={() => toggle("courses", c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>Occasion</h4>
        <div className="pills">
          {window.OCCASIONS.map(o => (
            <button key={o} className={`filter-pill ${filters.occasions.includes(o) ? "on" : ""}`} onClick={() => toggle("occasions", o)}>{o}</button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>Time from start to finish</h4>
        <div className="pills">
          {[15, 30, 60, 120, 240].map(m => (
            <button key={m} className={`filter-pill ${filters.maxTime === m ? "on" : ""}`} onClick={() => setFilters(f => ({ ...f, maxTime: f.maxTime === m ? 0 : m }))}>
              ≤ {fmtDuration(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>Difficulty</h4>
        <div className="pills">
          {["Easy","Medium","Patient","Tricky"].map(d => (
            <button key={d} className={`filter-pill ${filters.difficulties.includes(d) ? "on" : ""}`} onClick={() => toggle("difficulties", d)}>{d}</button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>Allergies & preferences</h4>
        <div className="pills">
          {window.DIETS.map(d => (
            <button key={d} className={`filter-pill ${filters.diets.includes(d) ? "on" : ""}`} onClick={() => toggle("diets", d)}>{d}</button>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
          Shows recipes that match <strong>any</strong> selected preference.
        </div>
      </div>

      <div className="drawer-section">
        <h4>Cuisine</h4>
        <div className="pills">
          {window.CUISINES.map(c => (
            <button key={c} className={`filter-pill ${filters.cuisines.includes(c) ? "on" : ""}`} onClick={() => toggle("cuisines", c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>Created by</h4>
        <div className="pills">
          {window.AUTHORS.map(a => (
            <button key={a} className={`filter-pill ${filters.authors.includes(a) ? "on" : ""}`} onClick={() => toggle("authors", a)}>{a}</button>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

Object.assign(window, { FiltersDrawer });
