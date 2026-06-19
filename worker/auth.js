// Password + session primitives for the worker.
// Workers runtime exposes SubtleCrypto natively, no external
// deps required. Sessions are stateless: a base64-encoded JSON
// payload signed with HMAC-SHA256 over SESSION_SECRET.

// The shared fixed salt used by migration 0026 to seed a temp
// password for existing accounts. Detecting it on login lets us
// force a password change before the cook can use the app.
export const TEMP_PASSWORD_SALT = "686569726c6f6f6d2d74656d702d3032";

// Password policy for resets + signups (post-temp). Min 6 chars,
// must include at least one digit OR one non-alphanumeric
// character.
export function passwordPolicyIssue(password) {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  if (password.length > 128) return "Password is too long.";
  if (!/[0-9]/.test(password) && !/[^A-Za-z0-9]/.test(password)) {
    return "Password must include a number or a symbol.";
  }
  return null;
}

const PBKDF2_ITERS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function bytesToB64Url(bytes) {
  // base64url — no padding, no + or / chars (cookie-safe).
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ── Password hashing (PBKDF2-SHA256 / 100k iters) ──
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt);
  return { hash: bytesToHex(hash), salt: bytesToHex(salt) };
}

export async function verifyPassword(password, storedHashHex, storedSaltHex) {
  if (!storedHashHex || !storedSaltHex) return false;
  const salt = hexToBytes(storedSaltHex);
  const expected = hexToBytes(storedHashHex);
  const actual = await pbkdf2(password, salt);
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERS },
    baseKey,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

// ── Session cookie (signed, stateless) ──
// Token format: <b64url(payload)>.<b64url(hmac)>
// Payload: { email, iat, exp }

async function hmacKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

export async function signSession(env, email) {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET not set");
  const now = Math.floor(Date.now() / 1000);
  const payload = { email, iat: now, exp: now + SESSION_TTL_SECONDS };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = bytesToB64Url(new TextEncoder().encode(payloadJson));
  const key = await hmacKey(env.SESSION_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${bytesToB64Url(new Uint8Array(sig))}`;
}

export async function verifySession(env, token) {
  if (!token || !env.SESSION_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await hmacKey(env.SESSION_SECRET);
    const sig = b64UrlToBytes(sigB64);
    const ok = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(payloadB64));
    if (!ok) return null;
    const payloadJson = new TextDecoder().decode(b64UrlToBytes(payloadB64));
    const payload = JSON.parse(payloadJson);
    if (!payload?.email || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.email.toLowerCase();
  } catch {
    return null;
  }
}

// ── Cookie helpers ──
const COOKIE_NAME = "heirloom_session";

export function sessionCookie(token) {
  // HttpOnly + Secure + SameSite=Lax + 30-day Max-Age.
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readSessionCookie(c) {
  const header = c.req.header("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE_NAME) return rest.join("=");
  }
  return null;
}

// ── Email format check (worker side validation) ──
export function isValidEmail(email) {
  if (typeof email !== "string") return false;
  if (email.length < 5 || email.length > 254) return false;
  // Pragmatic check: one @, dot in the host, no whitespace.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Password policy ──
export function passwordIssues(password) {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password is too long.";
  return null;
}
