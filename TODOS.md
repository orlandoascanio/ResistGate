# TODOS

Tracked deferred work. Items here are not yet PRs. Ordered by priority.

---

## P1 — Active implementation risks

### Outcome tap recording bug
**What:** The popup already shows an outcome tap prompt after temporary access expires, but responses are not persisted correctly.

**Evidence:** `popup/popup.js` sends `{ action: 'recordAnalyticsEvent', event: { type, domain, response } }`, while `background.js` reads `request.type` and `request.domain`. `recordAnalyticsEvent()` also omits `outcome_tap_response` from its local analytics allowlist even though `sanitizeAnalytics()` recognizes the type.

**Why:** The UI can ask "Did your visit serve you?", but the answer is dropped. That breaks the awareness loop this feature was meant to validate.

**Fix notes:**
- Add a regression test for the popup outcome tap click path.
- Use a top-level payload (`type`, `domain`, `response`) or add a dedicated `recordOutcomeTapResponse` action.
- Persist sanitized yes/no responses in local analytics.
- Only add weekly report trend UI after capture is verified.

**Effort:** S. **Depends on:** none.

---

## P1 — After research sprint validates hypothesis

### Outcome tap (permanent feature)
**What:** After research sprint validates Intention Page hypothesis, finish outcome tap as
a permanent feature. The temporary-access expiry and popup prompt are partially implemented;
the next step is reliable `outcome_tap_response` capture and weekly-report trend surfacing.

**Why:** Closes the awareness loop: intention stated → access → reflection. This is
the data that proves awareness-based friction changes behavior over time.

**Pros:** Validates core hypothesis directly. Feeds weekly report with confirmed outcomes.
**Cons:** M effort. Only worth building after sprint confirms Intention Page is the wedge.

**Architecture notes:**
- background.js: on `resistgate-access-expire-*` alarm, write
  `pendingOutcomeTap: { domain, expiredAt }` to chrome.storage.local
- popup.js: on load, read `pendingOutcomeTap`. If within 24h, show prompt. Clear after response.
- Add `outcome_tap_response` to `allowedTypes` in `sanitizeAnalytics()`
- Add `sanitizePendingOutcomeTap()` function (returns null for invalid input)
- MV3 constraint: popup cannot be invoked from background — "last expiry wins" if multiple
  accesses expire before popup opens

**Effort:** M human / S with CC. **Depends on:** research sprint outcome.

---

### Approach B — Intentions vs. reality feature
**What:** Store the user's typed intention text alongside each access grant. Surface it
in a weekly "intentions vs. reality" report showing what you said you'd do vs. what
you actually did.

**Why:** This is the product's core philosophical bet — awareness changes behavior. If
true, this is the differentiator no other focus tool offers. If false, don't build it.

**Pros:** Creates the "mirror not cage" differentiator. Foundation for all future analytics.
**Cons:** L effort. Requires Intention Page to be the wedge (validated by sprint first).

**Architecture notes (from design doc):**
- New `intentionLog` storage key, capped at 500 entries, separate from `analytics` (3000 cap)
- Schema: `{ domain, timestamp, intentionText, accessGranted: bool }[]`
- Add `sanitizeIntentionLog()` function
- CRITICAL: do NOT write `intention_recorded` events to `analytics` array —
  `sanitizeAnalytics()` will silently corrupt unknown event types. Use `intentionLog` key only.
- friction-page/script.js: capture intention text before granting access
- options/options.js: new "Intentions" tab or section in Weekly Report tab
- background.js: new `recordIntention` + `getIntentionLog` message actions

**Effort:** L human / M with CC. **Depends on:** research sprint validation.

---

## P2 — Post-100 users

### Triggered feedback prompt (visit-count threshold)
**What:** After a user has blocked 10 visits, show a one-time banner in the popup:
"You've resisted 10 times this week. Mind sharing how it's going?" with Google Form link.

**Why:** Passive feedback links (options, popup footer, friction page) have low response
rates. A context-timed prompt at peak engagement catches users when they're most likely
to respond and most invested in the product.

**Pros:** Higher expected response rate. Users blocked 10x have the strongest opinions.
**Cons:** M effort. Premature for 11 users — return to this when 100+ users active.

**Architecture notes:**
- analytics read on popup load to check blocked-visit count
- new `dismissedFeedbackPrompt` boolean in settings or storage
- one-time banner UI in popup (non-blocking, closeable)
- follows existing analytics event counting pattern

**Effort:** M human / S with CC. **Depends on:** 100+ active users.
