// Filters drawer

import { useState } from "react";
import { fmtDuration } from "./helpers.jsx";
import { Drawer } from "./ui.jsx";
import { COURSES, OCCASIONS, DIETS, CUISINES } from "./data.js";
import { useLang } from "./i18n.js";

export function FiltersDrawer({ open, onClose, filters, setFilters }) {
  const { t, tCourse, tOccasion, tDiet, tDifficulty } = useLang();
  const toggle = (k, v) => {
    setFilters(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("filterTheCookbook")}
      footer={
        <>
          <button className="btn ghost" onClick={() => setFilters({ courses: [], diets: [], occasions: [], authors: [], cuisines: [], difficulties: [], maxTime: 0 })}>
            {t("clearAll")}
          </button>
          <button className="btn primary" onClick={onClose}>{t("showResults")}</button>
        </>
      }
    >
      <div className="drawer-section">
        <h4>{t("course")}</h4>
        <div className="pills">
          {COURSES.map(c => (
            <button key={c} className={`filter-pill ${filters.courses.includes(c) ? "on" : ""}`} onClick={() => toggle("courses", c)}>{tCourse(c)}</button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>{t("occasion")}</h4>
        <div className="pills">
          {OCCASIONS.map(o => (
            <button key={o} className={`filter-pill ${filters.occasions.includes(o) ? "on" : ""}`} onClick={() => toggle("occasions", o)}>{tOccasion(o)}</button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>{t("timeFromStartToFinish")}</h4>
        <div className="pills">
          {[15, 30, 60, 120, 240].map(m => (
            <button key={m} className={`filter-pill ${filters.maxTime === m ? "on" : ""}`} onClick={() => setFilters(f => ({ ...f, maxTime: f.maxTime === m ? 0 : m }))}>
              ≤ {fmtDuration(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>{t("difficulty")}</h4>
        <div className="pills">
          {["Easy","Medium","Patient","Tricky"].map(d => (
            <button key={d} className={`filter-pill ${filters.difficulties.includes(d) ? "on" : ""}`} onClick={() => toggle("difficulties", d)}>{tDifficulty(d)}</button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>{t("allergiesAndPreferences")}</h4>
        <div className="pills">
          {DIETS.map(d => (
            <button key={d} className={`filter-pill ${filters.diets.includes(d) ? "on" : ""}`} onClick={() => toggle("diets", d)}>{tDiet(d)}</button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <h4>{t("cuisine")}</h4>
        <div className="pills">
          {CUISINES.map(c => (
            <button key={c} className={`filter-pill ${filters.cuisines.includes(c) ? "on" : ""}`} onClick={() => toggle("cuisines", c)}>{c}</button>
          ))}
        </div>
      </div>

    </Drawer>
  );
}
