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
    // Dedupe re-taps on the SAME saved recipe — but only when
    // recipeId is real. A null recipeId (add-recipe form before
    // first save) used to collide with any other null-recipe
    // timer at the same stepIdx, silently blocking new timers
    // from being created in the editor.
    if (recipeId) {
      const existing = cur.find(t => t.recipeId === recipeId && t.stepIdx === stepIdx && !t.firedAt);
      if (existing) return existing.id;
    }
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
// Sound — bell chime via HTMLAudioElement.
//
// We tried Web Audio (OscillatorNode + GainNode) first; iOS
// Safari kept blocking the chime even after warmAudio() called
// ctx.resume() inside a user gesture, presumably because the
// subsequent playChime() calls from the tick interval don't
// re-establish a gesture. HTMLAudioElement is a lot more
// permissive: once .play() resolves once after a user gesture,
// later .play() calls work even from setInterval / setTimeout.
//
// We don't bundle an audio asset — instead a short bell WAV is
// generated in JS at module load (mixed E5 + G#5 sine waves
// with an exponential decay envelope), encoded as a Blob, and
// exposed via a blob: URL. ~30 KB in memory, zero network
// round-trip, no autoplay-policy nuance from cross-origin
// sources.
// ─────────────────────────────────────────────────────────────

const CHIME_INTERVAL_MS = 3500;
let lastChimeAt = 0;
let chimeAudio = null;

function makeChimeBlobUrl() {
  if (typeof window === "undefined") return null;
  const sampleRate = 22050;
  const durationSec = 1.5;
  const numSamples = Math.floor(sampleRate * durationSec);
  // Generate stereo-folded mono samples for E5 + G#5 with a
  // tail-ramp envelope. The second tone starts 180ms in to
  // mirror the original Web Audio version.
  const samples = new Float32Array(numSamples);
  const tone = (freq, startSamp, gain = 0.32) => {
    for (let i = startSamp; i < numSamples; i++) {
      const tRel = (i - startSamp) / sampleRate;
      if (tRel < 0) continue;
      // Exponential decay so the bell rings then quiets.
      const env = Math.exp(-tRel * 2.6) * gain;
      samples[i] += Math.sin(2 * Math.PI * freq * tRel) * env;
    }
  };
  tone(659.25, 0);                        // E5
  tone(830.61, Math.floor(0.18 * sampleRate));  // G#5
  // Clamp to [-1, 1] in case the mix briefly exceeds 1.0.
  for (let i = 0; i < numSamples; i++) {
    if (samples[i] > 1) samples[i] = 1;
    else if (samples[i] < -1) samples[i] = -1;
  }
  // PCM 16-bit mono WAV header + body.
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);            // PCM chunk size
  view.setUint16(20, 1, true);             // format = PCM
  view.setUint16(22, 1, true);             // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true);            // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, samples[i] * 0x7fff, true);
  }
  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

function getChimeAudio() {
  if (chimeAudio) return chimeAudio;
  if (typeof window === "undefined") return null;
  const url = makeChimeBlobUrl();
  if (!url) return null;
  chimeAudio = new Audio(url);
  chimeAudio.preload = "auto";
  return chimeAudio;
}

// Unlock the audio element inside a user gesture. Once .play()
// resolves once after a tap/click, later .play() calls work even
// without a gesture (which is how the looping chime fires from
// the tick interval).
export function warmAudio() {
  // Wrap the whole thing — older Safari throws synchronously
  // from .play() in some states, and we never want that to
  // bubble up to a click handler and abort the rest of its
  // body (e.g. the startTimer() call that follows).
  try {
    const a = getChimeAudio();
    if (!a) return;
    const prevVolume = a.volume;
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        try { a.pause(); a.currentTime = 0; } catch {}
        a.volume = prevVolume;
      }).catch(() => {
        a.volume = prevVolume;
      });
    } else {
      try { a.pause(); a.currentTime = 0; } catch {}
      a.volume = prevVolume;
    }
  } catch {}
}

export function playChime() {
  const a = getChimeAudio();
  if (!a) return;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
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
  const { fire } = useTimers();
  const firedIdsRef = useRef(new Set());
  useEffect(() => {
    // We drive the expiry check from a dedicated setInterval
    // rather than a useEffect([timers]) — `timers` only changes
    // when something WRITES to the store (start/pause/etc.), so
    // a useEffect-based check never observes the natural
    // countdown and chimes never fired. Re-reading the store
    // every 250ms is cheap (a JSON.parse of a short string) and
    // guarantees we notice when a timer crosses zero.
    const check = () => {
      const list = readStore();
      const now = Date.now();
      for (const t of list) {
        if (t.firedAt || t.paused) continue;
        if (remainingMs(t, now) <= 0 && !firedIdsRef.current.has(t.id)) {
          firedIdsRef.current.add(t.id);
          fire(t.id);
        }
      }
      // Reap fired ids that no longer exist so re-fire works
      // correctly if a cook starts the same step twice.
      const live = new Set(list.map(t => t.id));
      for (const id of firedIdsRef.current) {
        if (!live.has(id)) firedIdsRef.current.delete(id);
      }
      maybeChime(list);
    };
    check();
    const id = setInterval(check, 250);
    return () => clearInterval(id);
  }, [fire]);
  return null;
}
