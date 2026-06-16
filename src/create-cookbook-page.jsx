// Full-page Create cookbook flow — replaces the modal version
// invoked from the library "New cookbook" button. Reuses the
// card layout of the cookbook settings page so the create +
// edit surfaces feel cohesive.

import { useEffect, useState } from "react";
import { Icon } from "./helpers.jsx";
import { LanguagePicker, NetworkPicker, COVER_COLORS } from "./cookbooks.jsx";

export function CreateCookbookPage({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [cookbookType, setCookbookType] = useState("");
  const [languages, setLanguages] = useState(["en"]);
  const [coverColor, setCoverColor] = useState(null);
  const [coverPhoto, setCoverPhoto] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [allowComments, setAllowComments] = useState(true);
  const [makeDefault, setMakeDefault] = useState(false);
  const [network, setNetwork] = useState([]);
  const [invites, setInvites] = useState([]);
  const [manualEmail, setManualEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/admin/me/network", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.network) setNetwork(data.network); })
      .catch(() => {});
  }, []);

  const addInvite = (email) => {
    const e = (email || "").trim().toLowerCase();
    if (!e) return;
    if (invites.some(i => i.email === e)) return;
    setInvites(prev => [...prev, { email: e, role: "editor" }]);
  };
  const removeInvite = (email) => setInvites(prev => prev.filter(i => i.email !== email));
  const setInviteRole = (email, role) =>
    setInvites(prev => prev.map(i => i.email === email ? { ...i, role } : i));

  const uploadCover = async (file) => {
    if (!file) return;
    setUploadingCover(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/admin/uploads", { method: "POST", credentials: "include", body: fd });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);
      const { url } = await up.json();
      setCoverPhoto(url);
    } catch (err) {
      setError(err.message || "Could not upload photo.");
    } finally {
      setUploadingCover(false);
    }
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    const n = name.trim();
    if (!n) { setError("Give it a name."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cookbooks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, blurb, visibility, languages, coverColor, coverPhoto, cookbookType: cookbookType || null }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Create failed (${res.status})`);
      }
      const { cookbook } = await res.json();
      // Fire each invitation. Failures are non-fatal — the cookbook
      // is already created, we just log issues.
      for (const inv of invites) {
        try {
          await fetch(`/api/admin/cookbooks/${cookbook.id}/invitations`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: inv.email, role: inv.role }),
          });
        } catch {}
      }
      if (makeDefault) {
        try {
          await fetch("/api/admin/cookbooks/order", {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ defaultId: cookbook.id }),
          });
        } catch {}
      }
      onCreated?.(cookbook);
    } catch (err) {
      setError(err.message || "Could not create cookbook.");
    } finally {
      setSaving(false);
    }
  };

  const networkAvailable = network.filter(p =>
    !invites.some(i => i.email === p.email)
  );
  const niceName = (p) => p.displayName || [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email;

  return (
    <div className="cookbook-page cookbook-create" data-screen-label="Create cookbook">
      <button className="btn ghost" onClick={onClose} style={{ marginBottom: 16 }}>
        <Icon name="chevL" /> Back to library
      </button>

      <form className="cb-settings" onSubmit={submit}>
        <div className="cb-members-head">
          <div>
            <div className="eyebrow">New cookbook</div>
            <h1>Start a cookbook</h1>
          </div>
        </div>

        {/* Card 1: identity */}
        <div className="cb-card">
          <div className="cb-field-stack">
            <label className="cb-field-label" htmlFor="cb-new-name">
              Cookbook name
              <span className="cb-field-count">{name.length}/50</span>
            </label>
            <input
              id="cb-new-name"
              type="text"
              className="cb-field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Smith Family Cookbook, Healthy recipes…"
              autoFocus
              maxLength={50}
            />
          </div>
          <div className="cb-field-stack">
            <label className="cb-field-label" htmlFor="cb-new-blurb">
              Description
              <span className="cb-field-count">{blurb.length}/150</span>
            </label>
            <textarea
              id="cb-new-blurb"
              className="cb-field-input cb-field-textarea"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              placeholder="What's this cookbook about?"
              maxLength={150}
              rows={3}
            />
          </div>
          <div className="cb-field-stack">
            <label className="cb-field-label" htmlFor="cb-new-type">Cookbook type</label>
            <select
              id="cb-new-type"
              className="cb-field-input"
              value={cookbookType}
              onChange={(e) => setCookbookType(e.target.value)}
            >
              <option value="">— Not set —</option>
              <option value="family-heirloom">Family heirloom cookbook</option>
              <option value="personal">Personal cookbook</option>
              <option value="group">Group cookbook</option>
            </select>
          </div>
        </div>

        {/* Card 2: languages */}
        <div className="cb-card">
          <div className="cb-card-title">Languages</div>
          <div className="cb-card-desc">The languages this cookbook is kept in. Pick the ones your recipes are written in.</div>
          <LanguagePicker value={languages} onChange={setLanguages} />
        </div>

        {/* Card 3: cover colour + cover photo */}
        <div className="cb-card cb-rows-card">
          <div className="cb-setting-row cb-setting-row--stack-mobile">
            <div className="cb-setting-text">
              <div className="cb-setting-label">Cover colour</div>
              <div className="cb-setting-desc">The cloth colour of the book when there's no cover photo.</div>
            </div>
            <div className="cb-setting-control">
              <div className="cb-color-swatches" role="radiogroup" aria-label="Cover colour">
                {COVER_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={coverColor === c.value}
                    className={`cb-color-swatch ${coverColor === c.value ? "active" : ""}`}
                    style={{ background: c.value }}
                    onClick={() => setCoverColor(c.value)}
                    title={c.label}
                  />
                ))}
                <label
                  className={`cb-color-swatch custom ${coverColor && !COVER_COLORS.some(c => c.value === coverColor) ? "active" : ""}`}
                  title="Pick a custom colour"
                  style={coverColor && !COVER_COLORS.some(c => c.value === coverColor) ? { background: coverColor } : undefined}
                >
                  <Icon name="plus" size={11} />
                  <input
                    type="color"
                    value={coverColor && !COVER_COLORS.some(c => c.value === coverColor) ? coverColor : "#7a3a52"}
                    onChange={(e) => setCoverColor(e.target.value)}
                  />
                </label>
                {coverColor && (
                  <button
                    type="button"
                    className="cb-color-swatch reset"
                    onClick={() => setCoverColor(null)}
                    title="Reset to default"
                  >
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="cb-setting-row">
            <div className="cb-setting-text">
              <div className="cb-setting-label">Cover photo</div>
              <div className="cb-setting-desc">Optional — adds a family photo to the cookbook's cover.</div>
            </div>
            <div className="cb-setting-control">
              <label className="btn ghost" style={{ cursor: uploadingCover ? "wait" : "pointer" }}>
                <Icon name="camera" size={14} /> {uploadingCover ? "Uploading…" : (coverPhoto ? "Replace photo" : "Upload photo")}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={uploadingCover}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); e.target.value = ""; }}
                />
              </label>
              {coverPhoto && (
                <button type="button" className="btn ghost icon-only" onClick={() => setCoverPhoto(null)} title="Clear photo">
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card 4: visibility + comments + default */}
        <div className="cb-card cb-rows-card">
          <div className="cb-setting-row cb-setting-row--stack-mobile">
            <div className="cb-setting-text">
              <div className="cb-setting-label">Who can see this cookbook</div>
              <div className="cb-setting-desc">Private cookbooks are visible only to members. Public cookbooks appear in the directory and can be followed by anyone.</div>
            </div>
            <div className="cb-setting-control">
              <div className="cb-vis-toggle" role="group" aria-label="Visibility">
                <button
                  type="button"
                  className={`cb-vis-btn ${visibility === "private" ? "active" : ""}`}
                  onClick={() => setVisibility("private")}
                >
                  <Icon name="bookmark" size={13} /> Private
                </button>
                <button
                  type="button"
                  className={`cb-vis-btn ${visibility === "public" ? "active" : ""}`}
                  onClick={() => setVisibility("public")}
                >
                  <Icon name="share" size={13} /> Public
                </button>
              </div>
            </div>
          </div>
          <div className="cb-setting-row">
            <div className="cb-setting-text">
              <div className="cb-setting-label">Allow comments from followers</div>
              <div className="cb-setting-desc">People who follow this cookbook can leave notes on recipes they've cooked.</div>
            </div>
            <div className="cb-setting-control">
              <button
                type="button"
                role="switch"
                aria-checked={allowComments}
                className={`cb-switch ${allowComments ? "on" : ""}`}
                onClick={() => setAllowComments(v => !v)}
              >
                <span className="knob" />
              </button>
            </div>
          </div>
          <div className="cb-setting-row">
            <div className="cb-setting-text">
              <div className="cb-setting-label">Default cookbook</div>
              <div className="cb-setting-desc">Make this the cookbook that opens first when you sign in. It'll sit cover-facing at the front of your shelf.</div>
            </div>
            <div className="cb-setting-control">
              <button
                type="button"
                role="switch"
                aria-checked={makeDefault}
                className={`cb-switch ${makeDefault ? "on" : ""}`}
                onClick={() => setMakeDefault(v => !v)}
              >
                <span className="knob" />
              </button>
            </div>
          </div>
        </div>

        {/* Card 5: invite cooks */}
        <div className="cb-card cb-invite-card">
          <div className="cb-card-title">Invite cooks <span className="opt" style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>(optional)</span></div>
          <div className="cb-card-desc">They'll get an invitation as soon as the cookbook is created.</div>
          {invites.length > 0 && (
            <ul className="create-invite-list" style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {invites.map(inv => (
                <li key={inv.email} className="create-invite-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="who" style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 12 }}>{inv.email}</span>
                  <select
                    value={inv.role}
                    onChange={(e) => setInviteRole(inv.email, e.target.value)}
                    className="role-select"
                  >
                    <option value="editor">editor</option>
                    <option value="viewer">follower</option>
                  </select>
                  <button
                    type="button"
                    className="btn ghost icon-only"
                    onClick={() => removeInvite(inv.email)}
                    aria-label="Remove invite"
                  >
                    <Icon name="x" size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <NetworkPicker
            networkAvailable={networkAvailable}
            manualEmail={manualEmail}
            setManualEmail={setManualEmail}
            addInvite={addInvite}
            niceName={niceName}
          />
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="cb-settings-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || !name.trim()}>
            <Icon name="check" size={14} /> {saving ? "Creating…" : "Create cookbook"}
          </button>
        </div>
      </form>
    </div>
  );
}
