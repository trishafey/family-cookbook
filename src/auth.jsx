// Branded sign-in / sign-up surfaces.
// Renders at /signin and /signup. Shares the cookbook's serif
// + tomato visual language.

import { useState } from "react";
import { Icon } from "./helpers.jsx";
import { LANG_META, SUPPORTED_LANGS } from "./i18n.js";

function readReturnTo() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const ret = sp.get("return");
    if (ret && ret.startsWith("/")) return ret;
  } catch {}
  return "/cookbooks";
}

function AuthShell({ eyebrow, title, sub, children, footer }) {
  return (
    <div className="auth-page" data-screen-label="Sign in / Sign up">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/images/heirloom-tomato-long.png" alt="Heirloom" />
        </div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {sub && <p className="auth-sub">{sub}</p>}
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
    </div>
  );
}

// Password input with a "show password" toggle. Keeps the same
// onChange / value contract as a plain <input>.
function PasswordInput({ value, onChange, autoComplete, minLength = 0, required = true, placeholder }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="password-input">
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        minLength={minLength || undefined}
        required={required}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShown(s => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
      >
        <Icon name={shown ? "eye-off" : "eye"} size={16} />
      </button>
    </div>
  );
}

// Modal shown immediately after a successful login when the cook
// is still on the seeded "Tomato123" temp credential. Min 6
// chars + must contain a number or symbol. Submitting hits
// /api/auth/change-password and reloads to the intended page.
function ForcePasswordChange({ onDone }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (pw.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (!/[0-9]/.test(pw) && !/[^A-Za-z0-9]/.test(pw)) {
      setError("Password must include a number or a symbol.");
      return;
    }
    if (pw !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pw }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Could not update (${res.status})`);
      }
      onDone();
    } catch (err) {
      setError(err.message || "Could not update your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal cookbook-modal force-change-modal" role="dialog" aria-label="Set a new password">
        <div className="eyebrow">First sign-in</div>
        <h2>Set a real password</h2>
        <p className="modal-sub">
          You're signed in with a temporary password. Pick a new one before continuing — at least 6 characters with a number or symbol.
        </p>
        <form onSubmit={submit} className="auth-form" style={{ marginTop: 12 }}>
          <label className="auth-field">
            <span>New password</span>
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={6} />
          </label>
          <label className="auth-field">
            <span>Confirm</span>
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={6} />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="btn primary auth-submit" disabled={busy}>
            <Icon name="chef" size={14} /> {busy ? "Saving…" : "Save & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [needsChange, setNeedsChange] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Sign in failed (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      if (data?.mustChangePassword) {
        setNeedsChange(true);
        setSubmitting(false);
        return;
      }
      window.location.assign(readReturnTo());
    } catch (err) {
      setError(err.message || "Could not sign in.");
      setSubmitting(false);
    }
  };

  if (needsChange) {
    return <ForcePasswordChange onDone={() => window.location.assign(readReturnTo())} />;
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title={<><em>Sign in</em> to Heirloom</>}
      sub="Recipes, cookbooks, and the family table — all where you left them."
      footer={
        <>
          New here?{" "}
          <a href={`/signup${window.location.search}`}>Create an account</a>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="btn primary auth-submit" disabled={submitting}>
          <Icon name="chef" size={14} /> {submitting ? "Signing in…" : "Sign in"}
        </button>
        <a className="auth-link" href="/forgot-password">Forgot password?</a>
        {/* TEMP HINT — remove before opening up beyond family + friends. */}
        <div className="auth-hint">
          <Icon name="sparkle" size={11} />
          First time here? Text Patricia for your temporary password.
        </div>
      </form>
    </AuthShell>
  );
}

export function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [lang, setLang] = useState("en");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (!/[0-9]/.test(password) && !/[^A-Za-z0-9]/.test(password)) {
      setError("Password must include a number or a symbol.");
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          lang,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Sign up failed (${res.status})`);
      }
      window.location.assign(readReturnTo());
    } catch (err) {
      setError(err.message || "Could not create your account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="New here"
      title={<>Start your <em>Heirloom</em></>}
      sub="A family cookbook that grows with everyone who cooks from it."
      footer={
        <>
          Already have an account?{" "}
          <a href={`/signin${window.location.search}`}>Sign in</a>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field">
          <span>First name</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            maxLength={60}
            required
          />
        </label>
        <label className="auth-field">
          <span>Last name</span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            maxLength={60}
            required
          />
        </label>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="auth-field">
          <span>Phone</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="+1 555 555 5555"
            maxLength={32}
            required
          />
        </label>
        <label className="auth-field">
          <span>Default language</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)} required>
            {SUPPORTED_LANGS.map(c => (
              <option key={c} value={c}>{LANG_META[c].label}</option>
            ))}
          </select>
        </label>
        <label className="auth-field">
          <span>Password <span className="opt">(6+ chars · number or symbol)</span></span>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
          />
        </label>
        <label className="auth-field">
          <span>Confirm password</span>
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={6}
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="btn primary auth-submit" disabled={submitting}>
          <Icon name="chef" size={14} /> {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Forgot password"
      title={<>Reset your <em>password</em></>}
      sub="Password reset emails are coming in the next deploy. For now, text Patricia and she'll set a temporary one from the admin page."
      footer={
        <a href="/signin">Back to sign in</a>
      }
    >
      <div style={{ marginTop: 8, color: "var(--ink-3)", fontSize: 14, textAlign: "center" }}>
        Hold tight — the email flow is one push away.
      </div>
    </AuthShell>
  );
}
