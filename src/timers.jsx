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
    // Dedupe re-taps so a cook hitting the same Start timer
    // twice doesn't end up with two duplicate countdowns. Only
    // applies when recipeId is real — a null recipeId (add-recipe
    // form before first save) used to collide with any other
    // null-recipe timer at the same stepIdx and silently block
    // new timers from being created in the editor.
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
// Sound — belt-and-braces approach because iOS is hostile.
//
// What iOS Safari does that breaks the obvious solutions:
//   1. HTMLAudioElement is "unlocked" only when .play() resolves
//      inside a user gesture. Then later .play() calls work…
//      UNTIL the audio session is idle for some period (or the
//      tab backgrounds), at which point iOS revokes the unlock
//      and subsequent .play() calls are silently rejected.
//   2. Web Audio's AudioContext stays resumed longer but ALSO
//      gets suspended during background / idle on iOS Safari.
//
// Symptom reported: chime plays when user clicks +/- on a timer
// (a fresh user gesture re-primes audio) but not when the timer
// naturally elapses 5 minutes later (idle for the whole wait).
//
// Fix: two layers.
//   A. Keep the audio session ACTIVE while any timer is running.
//      We do this by playing a tiny silent loop on a SECOND
//      HTMLAudioElement — iOS treats the page as "currently
//      producing audio" so it doesn't revoke the unlock.
//   B. When the real chime needs to ring, try BOTH HTMLAudio
//      and Web Audio in parallel. Whichever path is still
//      unlocked wins; if both, the cook just hears them once
//      (they're the same tone).
// ─────────────────────────────────────────────────────────────

const CHIME_INTERVAL_MS = 3500;
let lastChimeAt = 0;
let chimeAudio = null;
let silentAudio = null;
let silentLoopRunning = false;
let webAudioCtx = null;

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

// Tiny silent WAV — 0.4 s of digital silence. Looped to keep
// the iOS audio session "active" while any timer is running so
// the chime unlock doesn't get revoked during the wait.
function makeSilentBlobUrl() {
  if (typeof window === "undefined") return null;
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * 0.4);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const ws = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); ws(8, "WAVE");
  ws(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); ws(36, "data"); view.setUint32(40, dataSize, true);
  // Samples are already zeroed by ArrayBuffer init.
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function getSilentAudio() {
  if (silentAudio) return silentAudio;
  if (typeof window === "undefined") return null;
  const url = makeSilentBlobUrl();
  if (!url) return null;
  silentAudio = new Audio(url);
  silentAudio.loop = true;
  silentAudio.volume = 0.001;  // not exactly 0, some iOS versions disable inaudible streams
  silentAudio.preload = "auto";
  return silentAudio;
}

function getWebAudioCtx() {
  if (webAudioCtx) return webAudioCtx;
  if (typeof window === "undefined") return null;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    webAudioCtx = new Ctx();
    return webAudioCtx;
  } catch {
    return null;
  }
}

function playWebAudioBell(ctx, freq, when, gain = 0.18) {
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

// Called whenever there's at least one running timer — starts
// the silent keep-alive loop if it isn't already going. Safe to
// call repeatedly. iOS treats a page with a playing media stream
// as "currently producing audio" so it won't revoke the audio
// unlock during the long wait for a kitchen timer to elapse.
export function ensureKeepalive() {
  if (silentLoopRunning) return;
  try {
    const a = getSilentAudio();
    if (!a) return;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(() => { silentLoopRunning = true; }).catch(() => {});
    } else {
      silentLoopRunning = true;
    }
  } catch {}
}

export function stopKeepalive() {
  if (!silentLoopRunning) return;
  try {
    silentAudio?.pause();
    silentLoopRunning = false;
  } catch {}
}

// Unlock every audio path we have inside a user gesture. Called
// from every Start-timer / +/- button click. Wrapped in try
// blocks because older Safari throws synchronously from .play()
// in some states and we never want that to abort the click
// handler before startTimer() runs.
export function warmAudio() {
  // (1) HTMLAudio chime — silent play to unlock.
  try {
    const a = getChimeAudio();
    if (a) {
      const prevVolume = a.volume;
      a.volume = 0;
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          try { a.pause(); a.currentTime = 0; } catch {}
          a.volume = prevVolume;
        }).catch(() => { a.volume = prevVolume; });
      } else {
        try { a.pause(); a.currentTime = 0; } catch {}
        a.volume = prevVolume;
      }
    }
  } catch {}
  // (2) Web Audio context — resume so later programmatic
  //     chimes can play. Web Audio context tends to stay resumed
  //     longer than HTMLAudio unlocks on iOS.
  try {
    const ctx = getWebAudioCtx();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    // Schedule a near-silent blip so the audio graph actually
    // starts (iOS sometimes drops the first real tone otherwise).
    if (ctx) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      env.gain.value = 0.0001;
      osc.connect(env).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    }
  } catch {}
  // (3) Start the silent keep-alive loop so iOS thinks we're
  //     "currently producing audio" and doesn't revoke the
  //     unlock during the long wait for the timer to elapse.
  ensureKeepalive();
}

export function playChime() {
  // Try both paths — whichever is still unlocked wins.
  try {
    const a = getChimeAudio();
    if (a) {
      try { a.currentTime = 0; } catch {}
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  } catch {}
  try {
    const ctx = getWebAudioCtx();
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      playWebAudioBell(ctx, 659.25, now);          // E5
      playWebAudioBell(ctx, 830.61, now + 0.18);   // G#5
    }
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
      // Keep iOS audio session alive while there's anything
      // active; release it when nothing's running so we don't
      // sit on the audio session forever.
      if (list.length > 0) ensureKeepalive(); else stopKeepalive();
      maybeChime(list);
    };
    check();
    const id = setInterval(check, 250);
    return () => clearInterval(id);
  }, [fire]);
  return null;
}
