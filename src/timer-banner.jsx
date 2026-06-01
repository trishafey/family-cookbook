// Full-width sticky banner under the nav. One chip per active
// timer, each with +/-1m, pause/resume, dismiss. When a timer is
// fired the chip turns terracotta and pulses to draw the cook's
// eye across the room.

import { Icon } from "./helpers.jsx";
import { useTimers, remainingMs, fmtTimerDuration } from "./timers.jsx";

export function TimerBanner() {
  const { timers, pause, resume, adjust, dismiss } = useTimers();
  if (timers.length === 0) return null;
  return (
    <div className="timer-banner">
      <div className="timer-banner-inner">
        {timers.map(t => {
          const fired = !!t.firedAt;
          const remaining = remainingMs(t);
          return (
            <div key={t.id} className={`timer-chip ${fired ? "fired" : ""} ${t.paused ? "paused" : ""}`}>
              <div className="timer-icon">
                <Icon name="timer" size={18} />
              </div>
              <div className="timer-body">
                <div className="timer-label" title={t.label}>{t.label}</div>
                <div className="timer-time">{fmtTimerDuration(remaining)}</div>
              </div>
              <div className="timer-adjust">
                <button type="button" onClick={() => adjust(t.id, -1)} title="Subtract 1 minute" aria-label="Subtract 1 minute">
                  <Icon name="minus" size={12} />
                </button>
                <button type="button" onClick={() => adjust(t.id, +1)} title="Add 1 minute" aria-label="Add 1 minute">
                  <Icon name="plus" size={12} />
                </button>
              </div>
              {!fired && (
                t.paused
                  ? <button type="button" className="timer-action" onClick={() => resume(t.id)} title="Resume" aria-label="Resume">
                      <Icon name="play" size={14} />
                    </button>
                  : <button type="button" className="timer-action" onClick={() => pause(t.id)} title="Pause" aria-label="Pause">
                      <Icon name="pause" size={14} />
                    </button>
              )}
              <button type="button" className="timer-dismiss" onClick={() => dismiss(t.id)} title={fired ? "Dismiss alert" : "Cancel timer"} aria-label={fired ? "Dismiss alert" : "Cancel timer"}>
                <Icon name="x" size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
