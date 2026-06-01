// Cooking timers — global, multi-timer, persistent.
//
// Architecture:
//  - Active timers live in localStorage (key "timers:active") so a
//    refresh, a navigation, or a tab reload doesn't lose them. The
//    storage value is the source of truth; React subscribes via a
//    storage-event listener so cross-tab edits also flow through.
//  - Each timer stores a wall-clock startedAt + an originalMins and
//    a paused-accumulated offset, NOT a "remaining" counter. That
//    way the clock keeps elapsing while the tab is backgrounded
//    (setInterval throttles) — the next read recomputes from real
//    timestamps and the cook sees the correct remaining time.
//  - A single 250ms tick at the App level drives re-renders and
//    detects when a timer crosses zero, at which point the chime
//    starts looping until the cook dismisses.
//
// Persistence shape (each entry):
//   { id, label, recipeId, stepIdx,
//     originalMins, adjustments,
//     startedAt, paused, pausedAt, pausedAccum,
//     firedAt, dismissed }

import { useEffect, useState, useCallback, useRef } from "react";

const STORE_KEY = "timers:active";

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStore(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
    // Same-tab listeners — the native "storage" event only fires
    // in OTHER tabs, so we dispatch a custom one here.
    window.dispatchEvent(new CustomEvent("timers:changed"));
  } catch {}
}

// Total elapsed ms accounting for pauses. If currently paused,
// stops counting at pausedAt.
export function elapsedMs(t, nowMs = Date.now()) {
  if (!t.startedAt) return 0;
  const end = t.paused ? t.pausedAt : nowMs;
  return Math.max(0, end - t.startedAt - (t.pausedAccum || 0));
}

// Remaining ms — original duration plus any +/-1m adjustments,
// minus elapsed. Goes negative when the timer is overdue (we
// surface that in the banner as "+0:05 over").
export function remainingMs(t, nowMs = Date.now()) {
  const durationMs = ((t.originalMins || 0) + (t.adjustments || 0)) * 60_000;
  return durationMs - elapsedMs(t, nowMs);
}

export function fmtTimerDuration(ms) {
  const overdue = ms < 0;
  const total = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const body = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return overdue ? `+${body}` : body;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useTimers() {
  const [timers, setTimers] = useState(readStore);
  // Drive a re-render every 250ms so countdowns visibly tick.
  // We don't need to re-read storage on every tick — the timer
  // objects are stable, only their derived remaining time
  // changes — but bumping a tick counter forces consumers that
  // call remainingMs() to recompute.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(x => x + 1), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const handler = () => setTimers(readStore());
    window.addEventListener("storage", handler);
    window.addEventListener("timers:changed", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("timers:changed", handler);
    };
  }, []);

  const start = useCallback(({ label, mins, recipeId, stepIdx }) => {
    const cur = readStore();
    // If a timer for the same step is already running, just
    // bring it forward (don't double-up). Cooks often re-tap.
    const existing = cur.find(t => t.recipeId === recipeId && t.stepIdx === stepIdx && !t.firedAt);
    if (existing) return existing.id;
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const next = [...cur, {
      id, label, recipeId: recipeId || null, stepIdx: stepIdx ?? null,
      originalMins: mins, adjustments: 0,
      startedAt: Date.now(), paused: false, pausedAt: null, pausedAccum: 0,
      firedAt: null, dismissed: false,
    }];
    writeStore(next);
    return id;
  }, []);

  const pause = useCallback((id) => {
    const cur = readStore();
    writeStore(cur.map(t => t.id === id && !t.paused
      ? { ...t, paused: true, pausedAt: Date.now() }
      : t));
  }, []);

  const resume = useCallback((id) => {
    const cur = readStore();
    writeStore(cur.map(t => {
      if (t.id !== id || !t.paused) return t;
      const pausedDuration = Date.now() - (t.pausedAt || Date.now());
      return { ...t, paused: false, pausedAt: null, pausedAccum: (t.pausedAccum || 0) + pausedDuration };
    }));
  }, []);

  // Add or subtract minutes. Used by the +/- chips in the banner.
  const adjust = useCallback((id, deltaMin) => {
    const cur = readStore();
    writeStore(cur.map(t => {
      if (t.id !== id) return t;
      const nextAdj = (t.adjustments || 0) + deltaMin;
      // If the cook adds time to a fired timer, un-fire so the
      // chime stops and the countdown resumes.
      const wasFired = !!t.firedAt;
      const newRemaining = ((t.originalMins || 0) + nextAdj) * 60_000 - elapsedMs(t, Date.now());
      if (wasFired && newRemaining > 0) {
        return { ...t, adjustments: nextAdj, firedAt: null };
      }
      return { ...t, adjustments: nextAdj };
    }));
  }, []);

  // Mark a timer as fired (rings the chime).
  const fire = useCallback((id) => {
    const cur = readStore();
    writeStore(cur.map(t => t.id === id && !t.firedAt ? { ...t, firedAt: Date.now() } : t));
  }, []);

  const dismiss = useCallback((id) => {
    const cur = readStore();
    writeStore(cur.filter(t => t.id !== id));
  }, []);

  return { timers, start, pause, resume, adjust, fire, dismiss };
}

// ─────────────────────────────────────────────────────────────
// Sound — synthesised chime via Web Audio API.
// A short bell tone (1.2s decay) played on a major-third interval
// (E5 + G#5). Loops every ~3.5s until the cook dismisses; the
// looping is driven by the App tick, not setInterval, so we
// never leak timers if the component unmounts mid-ring.
// ─────────────────────────────────────────────────────────────

let audioCtx = null;
let lastChimeAt = 0;
const CHIME_INTERVAL_MS = 3500;

function getCtx() {
  if (audioCtx) return audioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

function playBellTone(ctx, freq, when, gain = 0.18) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 1.2);
  osc.connect(env).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 1.25);
}

export function playChime() {
  const ctx = getCtx();
  if (!ctx) return;
  // Browsers throttle audio until the first user gesture. If
  // the context is suspended, try to resume; if it fails we
  // silently no-op (the chime just won't sound until the next
  // user interaction).
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  playBellTone(ctx, 659.25, now);          // E5
  playBellTone(ctx, 830.61, now + 0.18);   // G#5
  lastChimeAt = Date.now();
}

// Should we ring the chime right now? True if any timer has
// fired + isn't dismissed AND it's been long enough since the
// last chime to loop again.
export function maybeChime(timers) {
  const firing = timers.find(t => t.firedAt && !t.dismissed);
  if (!firing) return false;
  if (Date.now() - lastChimeAt < CHIME_INTERVAL_MS) return false;
  playChime();
  return true;
}

// ─────────────────────────────────────────────────────────────
// TimerTicker — invisible component that:
//   1. Detects when any running timer crosses zero → calls fire(id)
//   2. Loops the chime while there's a fired timer
// Mounted once at App level.
// ─────────────────────────────────────────────────────────────

export function TimerTicker() {
  const { timers, fire } = useTimers();
  const firedIdsRef = useRef(new Set());
  useEffect(() => {
    const now = Date.now();
    for (const t of timers) {
      if (t.firedAt || t.paused) continue;
      if (remainingMs(t, now) <= 0 && !firedIdsRef.current.has(t.id)) {
        firedIdsRef.current.add(t.id);
        fire(t.id);
      }
    }
    // Forget fired ids that no longer exist so re-fire works
    // correctly if a cook starts the same step twice.
    const live = new Set(timers.map(t => t.id));
    for (const id of firedIdsRef.current) {
      if (!live.has(id)) firedIdsRef.current.delete(id);
    }
    maybeChime(timers);
  }, [timers, fire]);
  return null;
}
