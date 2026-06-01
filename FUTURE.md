# Future work log

A running record of features we've discussed but deferred. Each entry should
have enough context that whoever picks it up later doesn't need to re-derive
the design.

---

## Per-cookbook canonical language + source-language extraction

**Status**: deferred. Phase 4 (multi-tenant cookbooks) likely lands first; this
slots in on top of that.

**Context**: Today the cookbook is canonical-English everywhere — the AI
extract prompt normalises any source language to English, and the existing
translation pipeline produces a Polish overlay after save. That works for
Patricia's family, where English is the lingua franca and Polish is a
secondary view. It does NOT serve the future case where a grandparent or
relative who doesn't read English well wants to add a recipe in their own
language and keep that as the recipe's native form.

**Goal**: each cookbook (and each cook within it) picks a *canonical
language*. Recipes added in that language stay native; the system translates
into the *other* languages for cooks who view in those.

**Two scenarios the design must support**:

1. **"Global English mode"** — Patricia's cookbook is canonical-English. A
   relative pastes / photographs a Polish recipe. The system detects Polish,
   populates the Edit form *in Polish* so the relative can verify what was
   extracted, then on save translates to English (the cookbook's canonical
   language) and stores the Polish source as the language overlay. Both
   English and Polish viewers see correct content.

2. **"Global Polish mode"** — Babcia's cookbook is canonical-Polish. She
   types or photographs a Polish recipe. It stays Polish on the edit form,
   Polish on save (no extract-time translation), and translates to English
   in the background so English-speaking cousins can still view it.

**Pieces this touches**:

- **Cookbook setup + settings**: a `canonical_lang` field on the cookbook.
  Set during creation; editable in settings. Defaults to the creator's UI
  language.
- **Per-user language preference**: separate from cookbook canonical — a cook
  views in their own preferred language regardless of which cookbook they're
  in.
- **AI extract**: drop the "always write English" instruction. Instead the
  prompt detects the source language, writes the output IN THE DETECTED
  LANGUAGE, and returns a `sourceLang` field (`"en"` / `"pl"` / etc.) so the
  worker knows what was just saved.
- **Edit form**: render in the detected source language (`useLang` swap
  scoped to the AddRecipe view while the draft has `sourceLang` set).
- **Save / translation pipeline**: instead of always going EN → PL, look at
  the cookbook's `canonical_lang` plus the recipe's `sourceLang`:
  - If source matches canonical → translate to all *other* supported langs.
  - If source ≠ canonical → translate source → canonical (store as the
    canonical blob), keep source as the overlay for that language.
- **Display**: existing `localizeRecipe` model already handles N
  translations via the `translations` object; the worker just needs to
  populate the right keys.

**Data model sketch** (added to recipe blob):

```js
{
  canonical_lang: "en",          // copied from cookbook at save time
  source_lang: "pl",             // detected; only set if ≠ canonical
  translations: {
    pl: { title, subtitle, ingredients[], steps[], tips[] },
    es: { ... },
    // canonical content lives in the top-level blob fields
  }
}
```

**Why not now**: needs the multi-tenant cookbook plumbing (Phase 4a/4b)
before per-cookbook settings exist, and the per-user language preference
needs the `users` table. Patricia's family cookbook works fine with the
current "always normalise to English" approach in the meantime.
