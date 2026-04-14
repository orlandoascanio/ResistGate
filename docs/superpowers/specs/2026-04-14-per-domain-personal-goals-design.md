# Per-Domain Personal Goals

**Date:** 2026-04-14  
**Status:** Approved  
**Scope:** Pro feature — Intention Page  

## Problem

The Intention Page has a single global `personalGoal` string shown on every blocked-site page regardless of domain. Users with multiple blocked sites want domain-specific goals (e.g., "Don't watch reels" for Instagram, "Stop scrolling subreddits" for Reddit).

## Decisions

1. **Per-domain only** — no global fallback goal. Domains without a personal goal show the default message "You blocked this for a reason."
2. **Set on the blocked-site card** — Pro-only UI, same pattern as the Temptation Bundle badge.
3. **Breathing exercise stays global** — only the goal text goes per-domain.
4. **Default message** — "You blocked this for a reason." when no goal is set (unchanged from current behavior).

## Data Model

### Before

```js
// blocklist entry
{ id, urlPattern, createdAt, unblockAt?, temptationBundle? }

// proFeatures.intentionPage
{ enabled, personalGoal, showBreathingExercise }
```

### After

```js
// blocklist entry — personalGoal added
{ id, urlPattern, createdAt, personalGoal?, unblockAt?, temptationBundle? }

// proFeatures.intentionPage — personalGoal removed
{ enabled, showBreathingExercise }
```

- `personalGoal` is a nullable string, max 200 characters, stored on each blocklist entry.
- The global `intentionPage.personalGoal` field is removed after migration.

### Migration

The migration runs inside `sanitizeSettings()`, after `sanitizeBlocklist()` and `sanitizeIntentionPage()` have both run. This ordering is critical: blocklist entries must be fully sanitized (so they exist as objects) before the migration distributes goals to them.

**`sanitizeIntentionPage()` must preserve `personalGoal` in its return shape** (as `personalGoal: ''` or the incoming value) so that `sanitizeSettings()` can detect a non-empty global goal and distribute it. Only after the migration runs does `personalGoal` get set to `''` on the `intentionPage` object. On subsequent sanitizations, `personalGoal` is falsy, the migration is a no-op, and the field remains `''` harmlessly.

Migration steps:

1. After both `blocklist` and `intentionPage` are sanitized, check if `intentionPage.personalGoal` is non-empty.
2. If so, copy `intentionPage.personalGoal.trim()` to every blocklist entry that lacks a `personalGoal` (or has an empty/whitespace one).
3. Set `intentionPage.personalGoal = ''`.
4. The sanitized settings object (including the migrated blocklist and blanked intentionPage) is written back to storage by `initializeExtension()` or `saveSettings()` as normal.

This is a one-time migration — on subsequent sanitizations the global field is already empty.

**Edge case: Re-adding a domain.** If a user removes a domain and later re-adds it, the new entry has no goal. The migration only distributes the global goal once (when it first runs), so the re-added domain gets the default message. This is expected behavior.

### Sanitization

`sanitizeBlocklist()` gains a `personalGoal` field:

```js
if (typeof rawEntry.personalGoal === 'string' && rawEntry.personalGoal.trim()) {
  entry.personalGoal = rawEntry.personalGoal.trim().slice(0, 200);
} else {
  delete entry.personalGoal;
}
```

`sanitizeIntentionPage()` keeps `personalGoal` in its return shape (for migration compatibility) but defaults it to `''`:

```js
const personalGoal = typeof incoming.personalGoal === 'string'
  ? incoming.personalGoal.trim().slice(0, 200)
  : '';

return {
  enabled: incoming.enabled === true,
  personalGoal,
  showBreathingExercise: incoming.showBreathingExercise === true
};
```

Note: `personalGoal` is preserved through sanitization (not stripped) so the migration logic in `sanitizeSettings()` can detect and distribute it. After migration sets it to `''`, future sanitizations just pass through the empty string.

## Options UI

### Blocked-site card

Each blocked-site card gains a **Personal goal** badge (Pro-only), built by a `buildPersonalGoalConfig()` function alongside the existing `buildBundleConfig()`, appended to the `blocked-site-row` div inside `loadBlockedSites()`.

- **Collapsed (no goal set):** "+ Set goal" with the `bundle-badge--off` style (same visual treatment as a disabled temptation bundle).
- **Collapsed (goal set):** Truncated goal text using CSS `text-overflow: ellipsis` with a `max-width` of ~25ch (e.g., "Don't watch reels"). Uses `bundle-badge--on` style.
- **Expanded:** Text input (`<input type="text" maxlength="200">`) + Save/Cancel buttons.

**Clearing a goal:** The expanded panel has a "Remove" link/button next to Save. Clicking Remove sets `entry.personalGoal` to `''` (which `sanitizeBlocklist` converts to deleting the field). Alternatively, submitting an empty string also clears the goal via the same sanitization path.

**Paywall for free users:** The badge uses the `data-pro-feature="intentionPage"` attribute. This integrates with the existing `proControls` listener at `options.js:99` that calls `showPaywall()` on interaction when the user is not Pro. No special click handler needed beyond marking the badge with the `data-pro-feature` attribute. For the expanded input panel, Pro-gating is handled at save time — if a free user somehow reaches the Save button, `withLatestSettings` checks `isProUser()` before proceeding.

### Pro tab — Intention Page section

- **Removed from HTML:** The `<label for="personal-goal-text">`, the `<input id="personal-goal-text">`, and its `<p class="helper">` line.
- **Removed from JS:** The `options.js` save handler line `settings.proFeatures.intentionPage.personalGoal = document.getElementById('personal-goal-text').value.trim().slice(0, 200);` and the load line `document.getElementById('personal-goal-text').value = ...` are both removed.
- **Kept:** The `intention-page-enabled` toggle and the `breathing-exercise-enabled` toggle.
- **Updated helper text:** "Turn the blocked page into a moment of intention. Set a personal goal for each blocked site. When enabled, your per-site goal (or a default reminder) appears on the block page."

### Save flow

`saveSettings()` needs no special handling for `personalGoal` on entries — it's part of the blocklist entries that are already serialized. The global `intentionPage.personalGoal` line is removed from the save handler.

The per-domain goal is saved by updating the blocklist entry inline in the badge's Save handler, then calling the `updateSettings` message to persist the full settings object (same pattern as temptation bundle saving).

## Friction Page

### `renderIntentionPage()` changes

1. Extract the hostname from `currentOriginalUrl` (already available — the `blocked-site` element is already set from it in `DOMContentLoaded`).
2. Find the matching blocklist entry using the same `.endsWith()` pattern already used by `renderBundlePanel()`:
   ```js
   const hostname = new URL(safeTargetUrl).hostname.replace(/^www\./, '');
   const entry = (currentSettings.blocklist || []).find((e) => {
     const p = (e.urlPattern || '').toLowerCase();
     return hostname.endsWith(p) || p.endsWith(hostname);
   });
   ```
   This matches the existing domain lookup in `renderBundlePanel()` rather than using `normalizeDomain()` (which is not available in the friction page script).
3. Read the per-domain goal from `entry?.personalGoal`.
4. If a goal exists, display it. If not, fall back to "You blocked this for a reason."
5. The global `intentionPage.personalGoal` is no longer read for display.

The `intentionLabel` logic stays the same: "Remember your goal" when a goal is present, "Pause before proceeding" otherwise.

### Domain resolution

The friction page already receives the blocked domain via `?originalUrl=` query parameter and resolves it in `DOMContentLoaded`. The `.endsWith()` matching pattern is the same one used for temptation bundle lookups, ensuring consistency across the codebase.

## Background.js

### Changes

1. **`sanitizeBlocklist()`** — add `personalGoal` field sanitization (trim + 200 char max + delete if empty/whitespace).
2. **`sanitizeIntentionPage()`** — keep returning `personalGoal` field (trimmed, max 200 chars, default `''`) for migration compatibility.
3. **`sanitizeSettings()`** — after both `blocklist` and `intentionPage` are sanitized, add one-time migration: if `intentionPage.personalGoal` is non-empty, distribute it to all blocklist entries that lack a `personalGoal`, then set `intentionPage.personalGoal = ''`. The mutated `blocklist` and `intentionPage` are included in the returned settings object, which `initializeExtension()` compares against the stored version and writes back if changed.
4. **`DEFAULT_SETTINGS`** — remove `personalGoal` from `proFeatures.intentionPage` (set it to `''` or omit; since `sanitizeIntentionPage` returns it as `''`, omitting from defaults is cleaner).
5. No new message actions, storage keys, or alarms needed.

### Migration implementation

In `sanitizeSettings()`, after both `blocklist` and `intentionPage` are sanitized:

```js
// One-time migration: distribute global personalGoal to blocklist entries
if (intentionPage.personalGoal && intentionPage.personalGoal.trim()) {
  const globalGoal = intentionPage.personalGoal.trim();
  for (const entry of blocklist) {
    if (!entry.personalGoal || !entry.personalGoal.trim()) {
      entry.personalGoal = globalGoal;
    }
  }
  intentionPage.personalGoal = '';
}
```

The returned settings object contains the mutated `blocklist` and `intentionPage`. The caller (`initializeExtension()` or `saveSettings()`) writes the result to storage, so the migration persists.

## Testing

### New test cases

1. **Migration:** Settings with a non-empty `intentionPage.personalGoal` and entries with no `personalGoal` — all entries receive the global goal, and the global field is set to `''`.
2. **Migration does not overwrite existing goals:** Settings with a non-empty global goal, where one entry already has its own `personalGoal` — the existing per-entry goal is preserved, other entries get the global goal.
3. **Migration idempotency:** Re-sanitizing migrated settings does not re-copy or lose goals (global field is already `''`).
4. **Sanitization:** Entry with `personalGoal` exceeding 200 chars is truncated. Empty/whitespace-only `personalGoal` is deleted from the entry.
5. **Friction page:** Blocklist entry with `personalGoal` shows the per-domain goal. Entry without one shows default message.
6. **Friction page domain lookup:** The `.endsWith()` matching pattern works for domains like `www.instagram.com` matching `instagram.com` in the blocklist.
7. **Options UI:** Pro user can set/edit/clear a per-domain goal via the badge on blocked-site cards.
8. **Options UI paywall:** Free user sees paywall when clicking the goal badge.
9. **Clearing a goal:** Saving an empty string for `personalGoal` results in the field being deleted (via sanitizeBlocklist).
10. **Intention Page toggle off:** When `intentionPage.enabled` is false, no goal is shown regardless of per-domain settings.

### Existing tests

Existing tests for `sanitizeBlocklist`, `sanitizeIntentionPage`, `sanitizeSettings`, and friction-page rendering must be updated to account for the schema change. The `DEFAULT_SETTINGS` shape changes — `intentionPage.personalGoal` is removed from the default (or set to `''`).

## Files Changed

| File | Change |
|---|---|
| `background.js` | `sanitizeBlocklist()` adds `personalGoal` handling; `sanitizeIntentionPage()` preserves `personalGoal` in return shape; `sanitizeSettings()` adds migration after both are sanitized; `DEFAULT_SETTINGS` removes `personalGoal` from intentionPage default |
| `options/options.js` | Remove `personal-goal-text` input load/save lines (lines 353, 833); add `buildPersonalGoalConfig()` function alongside `buildBundleConfig()`; update `loadBlockedSites()` to append goal badge; goal badge uses `data-pro-feature="intentionPage"` for Pro gating; Save handler on goal badge updates blocklist entry and calls `updateSettings` message |
| `options/options.html` | Remove `personal-goal-text` input, its label, and its helper `<p>` from the Intention Page section; update the section's helper `<p>` text |
| `options/options.css` | Styles for personal-goal badge on blocked-site cards (reuses `.bundle-badge` / `.bundle-badge--on` / `.bundle-badge--off` classes where possible) |
| `friction-page/script.js` | `renderIntentionPage()` looks up blocklist entry via `.endsWith()` pattern and reads `entry.personalGoal`; removes reference to `intentionPage.personalGoal` |
| `tests/*.test.js` | Update existing tests for `sanitizeBlocklist`, `sanitizeIntentionPage`, `sanitizeSettings`; add new test cases for migration, per-domain goal rendering, goal clearing, and domain matching |