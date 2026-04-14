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

During `sanitizeSettings()`, if the old `intentionPage.personalGoal` is non-empty:

1. Copy it to every blocklist entry that lacks a `personalGoal`.
2. Blank out `intentionPage.personalGoal` to `''`.
3. This is a one-time migration — on subsequent sanitizations the global field is already empty.

This preserves the existing goal message for all currently blocked sites.

### Sanitization

`sanitizeBlocklist()` gains a `personalGoal` field:

```js
if (typeof rawEntry.personalGoal === 'string' && rawEntry.personalGoal.trim()) {
  entry.personalGoal = rawEntry.personalGoal.trim().slice(0, 200);
} else {
  delete entry.personalGoal;
}
```

`sanitizeIntentionPage()` no longer handles `personalGoal`. It returns:

```js
{ enabled: incoming.enabled === true, showBreathingExercise: incoming.showBreathingExercise === true }
```

## Options UI

### Blocked-site card

Each blocked-site card gains a **Personal goal** badge (Pro-only), styled identically to the existing Temptation Bundle badge:

- **Collapsed (no goal set):** "+ Set goal" with a muted off-state style.
- **Collapsed (goal set):** Truncated goal text (e.g., "Don't watch reels").
- **Expanded:** Text input (maxlength 200) + Save/Cancel buttons.

Free users clicking the badge see the paywall modal.

The badge is appended to the `blocked-site-row` div inside `loadBlockedSites()`, alongside the Temptation Bundle badge.

### Pro tab — Intention Page section

- **Removed:** The `personal-goal-text` input and its label/helper text.
- **Kept:** The `intention-page-enabled` toggle and the `breathing-exercise-enabled` toggle.
- **Updated helper text:** "Turn the blocked page into a moment of intention. Set a personal goal for each blocked site. When enabled, your per-site goal (or a default reminder) appears on the block page."

### Save flow

`saveSettings()` writes `entry.personalGoal` as part of each blocklist entry. The global `intentionPage.personalGoal` is no longer read or written from the UI.

## Friction Page

### `renderIntentionPage()` changes

1. Extract the domain from `currentOriginalUrl` (already available from URL params).
2. Find the matching blocklist entry: `currentSettings.blocklist.find(e => normalizeDomain(e.urlPattern) === domain)`.
3. Read the per-domain goal from `entry?.personalGoal`.
4. If a goal exists, display it. If not, fall back to "You blocked this for a reason."
5. The global `intentionPage.personalGoal` is no longer read for display.

The `intentionLabel` logic stays the same: "Remember your goal" when a goal is present, "Pause before proceeding" otherwise.

### Domain resolution

The friction page already receives the blocked domain via `?originalUrl=` query parameter and resolves it in `DOMContentLoaded`. The same domain string is used to look up the blocklist entry.

## Background.js

### Changes

1. **`sanitizeBlocklist()`** — add `personalGoal` field sanitization (trim + 200 char max + delete if empty).
2. **`sanitizeIntentionPage()`** — remove `personalGoal` from the return shape. Add one-time migration logic: if `incoming.personalGoal` is non-empty, distribute to blocklist entries missing `personalGoal`, then return `personalGoal: ''`.
3. **`sanitizeSettings()`** — call `sanitizeBlocklist()` before `sanitizeIntentionPage()`, and pass the blocklist into `sanitizeIntentionPage()` so it can distribute the global goal to entries during migration. Alternatively, perform the migration directly in `sanitizeSettings()` after both are sanitized.
4. No new message actions, storage keys, or alarms needed.

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

## Testing

### New test cases

1. **Migration:** Settings with a non-empty `intentionPage.personalGoal` and entries with no `personalGoal` — all entries receive the global goal, and the global field is cleared.
2. **Migration idempotency:** Re-sanitizing migrated settings does not re-copy or lose goals.
3. **Sanitization:** Entry with `personalGoal` exceeding 200 chars is truncated. Empty/whitespace-only `personalGoal` is deleted.
4. **Friction page:** Blocklist entry with `personalGoal` shows the per-domain goal. Entry without one shows default message.
5. **Options UI:** Pro user can set/edit/clear a per-domain goal. Free user sees paywall when clicking the goal badge.
6. **Intention Page toggle off:** When `intentionPage.enabled` is false, no goal is shown regardless of per-domain settings.

### Existing tests

Existing tests for `sanitizeBlocklist`, `sanitizeIntentionPage`, `sanitizeSettings`, and friction-page rendering must be updated to account for the schema change. The `DEFAULT_SETTINGS` shape changes — `intentionPage.personalGoal` is removed from the default.

## Files Changed

| File | Change |
|---|---|
| `background.js` | `sanitizeBlocklist()` adds `personalGoal` handling; `sanitizeIntentionPage()` removes `personalGoal`; `sanitizeSettings()` adds migration; `DEFAULT_SETTINGS` updated |
| `options/options.js` | Remove personal-goal input from Pro tab; add per-domain goal badge to blocked-site cards; update `loadBlockedSites()` and save flow |
| `options/options.html` | Remove personal-goal input/label from Intention Page section; update helper text |
| `options/options.css` | Styles for personal-goal badge on blocked-site cards |
| `friction-page/script.js` | `renderIntentionPage()` reads per-domain goal from blocklist entry |
| `tests/*.test.js` | Update existing tests; add new test cases for migration, sanitization, and rendering |