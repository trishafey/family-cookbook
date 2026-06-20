// Branded sign-in / sign-up surfaces.
// Renders at /signin and /signup. Shares the cookbook's serif
// + tomato visual language.

import { useEffect, useState } from "react";
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
          <Icon name="info" size={18} />
          <span>Can't log in? Existing accounts got a new temporary password. Text Patricia for your temporary password.</span>
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
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    setSubmitting(true);
    try {
      await fetch("/api/auth/request-reset", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      // Server returns 200 regardless of whether the email
      // exists, so we always render the "check your inbox"
      // surface to avoid leaking which addresses are registered.
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        eyebrow="Reset link sent"
        title={<>Check your <em>inbox</em></>}
        sub={`If an account exists for ${email.trim().toLowerCase()}, a reset link is on its way. It expires in 30 minutes.`}
        footer={<a href="/signin">Back to sign in</a>}
      >
        <div style={{ marginTop: 8, color: "var(--ink-3)", fontSize: 13, textAlign: "center" }}>
          No email after a few minutes? Check your spam folder or text Patricia.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Forgot password"
      title={<>Reset your <em>password</em></>}
      sub="Enter the email you sign in with. We'll send you a link to set a new password."
      footer={<a href="/signin">Back to sign in</a>}
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
        <button type="submit" className="btn primary auth-submit" disabled={submitting || !email.trim()}>
          <Icon name="chef" size={14} /> {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}

export function VerifyEmailPage() {
  const [status, setStatus] = useState("checking"); // checking | ok | invalid | expired
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = new URLSearchParams(window.location.search).get("token") || "";
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.ok) setStatus("ok");
        else if (data?.reason === "expired") setStatus("expired");
        else setStatus("invalid");
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === "checking") {
    return (
      <AuthShell eyebrow="Verifying" title={<>One moment</>}>
        <div style={{ marginTop: 8, color: "var(--ink-3)", fontSize: 14, textAlign: "center" }}>
          Confirming your email…
        </div>
      </AuthShell>
    );
  }
  if (status === "ok") {
    return (
      <AuthShell
        eyebrow="Email confirmed"
        title={<>You're <em>verified</em></>}
        sub="Your email is on file. You're all set."
        footer={<a href="/cookbooks">Open your cookbooks</a>}
      >
        <button
          type="button"
          className="btn primary auth-submit"
          onClick={() => window.location.assign("/cookbooks")}
        >
          <Icon name="chef" size={14} /> Open Heirloom
        </button>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      eyebrow="Verification"
      title={<>Link no longer <em>works</em></>}
      sub={status === "expired"
        ? "That verification link expired. Sign in and request a new one from your account."
        : "That verification link isn't valid. Sign in and request a new one."}
      footer={<a href="/signin">Sign in</a>}
    >
      <div style={{ marginTop: 8 }} />
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [token] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("token") || ""; }
    catch { return ""; }
  });
  const [status, setStatus] = useState("checking"); // checking | valid | invalid | done
  const [reason, setReason] = useState(null);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setStatus("invalid"); setReason("missing-token"); return; }
      try {
        const res = await fetch(`/api/auth/reset-status?token=${encodeURIComponent(token)}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.valid) setStatus("valid");
        else { setStatus("invalid"); setReason(data?.reason || null); }
      } catch {
        if (!cancelled) { setStatus("invalid"); setReason("network"); }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (pw.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (!/[0-9]/.test(pw) && !/[^A-Za-z0-9]/.test(pw)) {
      setError("Password must include a number or a symbol."); return;
    }
    if (pw !== confirm) { setError("Passwords don't match."); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: pw }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Reset failed (${res.status})`);
      }
      setStatus("done");
    } catch (err) {
      setError(err.message || "Could not reset your password.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "checking") {
    return (
      <AuthShell eyebrow="Reset password" title={<>One moment</>}>
        <div style={{ marginTop: 8, color: "var(--ink-3)", fontSize: 14, textAlign: "center" }}>
          Checking your reset link…
        </div>
      </AuthShell>
    );
  }
  if (status === "invalid") {
    const msg = reason === "expired"
      ? "That reset link expired. Reset links are only valid for 30 minutes — request a new one."
      : "That reset link isn't valid. Request a new one from the forgot-password page.";
    return (
      <AuthShell
        eyebrow="Reset link"
        title={<>Link no longer <em>works</em></>}
        sub={msg}
        footer={<a href="/forgot-password">Request a new link</a>}
      >
        <div style={{ marginTop: 8 }} />
      </AuthShell>
    );
  }
  if (status === "done") {
    return (
      <AuthShell
        eyebrow="Reset complete"
        title={<>You're <em>in</em></>}
        sub="Your password is set. You can head to your cookbooks now."
        footer={<a href="/cookbooks">Go to your cookbooks</a>}
      >
        <button
          type="button"
          className="btn primary auth-submit"
          onClick={() => window.location.assign("/cookbooks")}
        >
          <Icon name="chef" size={14} /> Open Heirloom
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Reset password"
      title={<>Choose a new <em>password</em></>}
      sub="At least 6 characters, with a number or a symbol."
      footer={<a href="/signin">Back to sign in</a>}
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field">
          <span>New password</span>
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={6} />
        </label>
        <label className="auth-field">
          <span>Confirm</span>
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={6} />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="btn primary auth-submit" disabled={submitting}>
          <Icon name="chef" size={14} /> {submitting ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
