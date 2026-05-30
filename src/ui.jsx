// ui.jsx — small shared UI bits

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./helpers.jsx";

// Renders children into a body-level <div class="print-only">. The
// global print stylesheet hides #root and shows .print-only nodes,
// which gives us a clean simplified print layout without fighting
// any of the on-screen styles.
export function PrintOnly({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(<div className="print-only">{children}</div>, document.body);
}

// Full-screen image viewer. Portaled to document.body so a
// `transform` or `filter` on any ancestor can't break the
// `position: fixed` overlay (a CSS containing-block trap that
// was making the lightbox render mid-page instead of full-bleed).
// Closes on backdrop click, Escape, or the × button. Locks
// body scroll while open so a tap-to-scroll on iPad doesn't
// scroll the page behind the dim.
export function Lightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);
  if (typeof document === "undefined" || !src) return null;
  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button
        className="lightbox-close"
        aria-label="Close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <Icon name="x" size={20} />
      </button>
      <img src={src} alt={alt || ""} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${size === "lg" ? "lg" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="dim" style={{ fontSize: 13, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button className="btn ghost icon-only" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <h3>{title}</h3>
          <button className="btn ghost icon-only" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && (
          <div style={{ position: "sticky", bottom: 0, padding: 16, borderTop: "1px solid var(--rule)", background: "var(--paper-2)", display: "flex", gap: 8, justifyContent: "space-between" }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

// Scaler control — number scaler with +/- buttons. step can be fractional.
export function Scaler({ value, onChange, min = 0.5, max = 99, step = 1, fmt = (v) => v }) {
  return (
    <div className="scaler">
      <button onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))} aria-label="Decrease">
        <Icon name="minus" size={13} />
      </button>
      <div className="val">{fmt(value)}</div>
      <button onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))} aria-label="Increase">
        <Icon name="plus" size={13} />
      </button>
    </div>
  );
}

// Time-of-day input (used for "done by" reverse-scheduling).
export function TimeOfDayInput({ value, onChange }) {
  // value: Date
  const hhmm = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  return (
    <input
      type="time"
      value={hhmm}
      onChange={(e) => {
        const [h, m] = e.target.value.split(":").map(Number);
        const d = new Date(value);
        d.setHours(h, m, 0, 0);
        onChange(d);
      }}
      style={{
        padding: "6px 10px", border: "1px solid var(--rule)", borderRadius: "var(--radius)",
        background: "var(--paper)", fontFamily: "var(--mono)", fontSize: 13,
      }}
    />
  );
}
