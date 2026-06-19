// Branded sign-in / sign-up surfaces. Renders as full-page
// screens at /signin and /signup. Shares the cookbook's serif
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

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
      window.location.assign(readReturnTo());
    } catch (err) {
      setError(err.message || "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  };

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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="btn primary auth-submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <a className="auth-link" href="/forgot-password">Forgot password?</a>
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
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
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
        <div className="auth-row">
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
        </div>
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
          <span>Password <span className="opt">(8+ characters)</span></span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="auth-field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="btn primary auth-submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
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
      sub="Password reset emails are coming in the next deploy. For now, ask Patricia to bump you back into the family if you're stuck."
      footer={
        <a href="/signin">Back to sign in</a>
      }
    >
      <div style={{ marginTop: 8, color: "var(--ink-3)", fontSize: 14 }}>
        Hold tight — the email flow is one push away.
      </div>
    </AuthShell>
  );
}
