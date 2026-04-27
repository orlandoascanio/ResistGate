# ResistGate — Next Steps Implementation Plan

## Audit summary

The core blocking engine, challenge flow, analytics, weekly report, and all Pro features in `background.js` are **fully implemented and operational**. The extension loads and works correctly as an unpacked extension.

**The single biggest hallucination / gap:** The "Pro upgrade" button in the options page calls `activateProPlan` which simply writes `subscription.tier = 'pro'` to local storage. There is **no Stripe, no backend, no license key, and no entitlement verification**. Any user can open DevTools → `chrome.storage.local.set({settings:{...}})` and self-grant Pro.

Everything else below follows naturally from this.

---

> [!IMPORTANT]
> The extension is installable and functional for free-tier features right now. The only thing blocking revenue is the missing payment layer.

---

## Phase 1 — Fix the blocking reliability gap (1–2 days)

There is one behavioral edge case to address before shipping to users.

### [MODIFY] [background.js](file:///Users/orlandoascanio/Desktop/App-Blocker-Extension/background.js)

**Problem:** `isStrictFocusActive()` in `background.js` returns `false` unless the schedule is enabled. This means Strict Mode does **nothing** if the user has not turned on the schedule, even though the ROADMAP describes Strict Mode as independently enforceable.

**Fix:** Separate strict mode enforcement from schedule. If `strictModeEnabled === true`, lock the config regardless of whether a schedule is active. Schedule only gates the blocking rules themselves.

```diff
 function isStrictFocusActive(settings, now) {
   if (!settings?.proFeatures?.strictModeEnabled) {
     return false;
   }
-  const schedule = settings?.freeExperience?.schedule;
-  if (!schedule?.enabled) {
-    return false;
-  }
-  return isWithinSimpleSchedule(schedule, now);
+  // If a schedule is set, only lock during active window; otherwise always locked.
+  const schedule = settings?.freeExperience?.schedule;
+  if (!schedule?.enabled) {
+    return true; // strict mode is globally active
+  }
+  return isWithinSimpleSchedule(schedule, now);
 }
```

**Verification:** Enable Strict Mode in Pro options without a schedule. Attempt to save settings — should be blocked with the "Configuration is locked" error.

---

## Phase 2 — Real Pro entitlement without a full backend (1–3 days)

Get real money flowing before building a production backend.

### Option A — License key (fastest path to revenue)

Use a simple HMAC-signed license key that the extension validates locally.

**Steps:**
1. Create a small Cloudflare Worker (or Vercel edge function) that:
   - Accepts a POST `/generate-license` with `{ email, plan, expiresAt }`.
   - Returns a signed JWT (`HS256`, secret stored only on server).
2. After Stripe payment succeeds (webhook), call this endpoint and email the key to the user.
3. In the extension options page, add a **"Enter license key"** input.
4. On submission, verify the JWT signature locally using `crypto.subtle`.
5. Store `{ licenseKey, email, tier, expiresAt }` in `chrome.storage.local`.
6. `hasProAccess()` in `background.js` checks `expiresAt > Date.now()` in addition to `tier === 'pro'`.

### [MODIFY] [background.js](file:///Users/orlandoascanio/Desktop/App-Blocker-Extension/background.js)

Replace the `activateProPlan` handler with a license-verification handler:

```js
case 'activateLicense': {
  const result = await verifyAndStoreLicense(request.licenseKey);
  sendResponse(result);
  return;
}
```

### [MODIFY] [options/options.html](file:///Users/orlandoascanio/Desktop/App-Blocker-Extension/options/options.html)

Replace the `start-yearly-btn` / `start-monthly-btn` click handlers with a license key entry form:

```html
<input id="license-key-input" type="text" placeholder="Paste your license key" />
<button id="activate-license-btn" class="btn btn-primary">Activate Pro</button>
```

### [NEW] License verification utility (inline in background.js)

```js
async function verifyAndStoreLicense(rawKey) {
  // rawKey is a JWT: header.payload.signature (base64url)
  // Verify using crypto.subtle with the embedded public key or HMAC key
  // Store verified claims in chrome.storage.local
}
```

> [!WARNING]
> The HMAC secret must **never** be embedded in the extension — use asymmetric RS256 so only the public key is in the extension bundle. The private key stays server-side.

### Option B — Stripe Checkout + webhook (more robust, 1 week)

1. Create Stripe product ($5/mo, $50/yr).
2. Host a minimal server (Vercel, Railway, or Render free tier) with:
   - `POST /create-checkout-session` — creates a Stripe Checkout session.
   - `POST /webhook` — listens for `checkout.session.completed`, issues a license.
   - `GET /verify-license?key=...` — returns `{ valid: true/false, expiresAt }`.
3. In the extension: the pricing screen "Start Pro" button opens `chrome.tabs.create({ url: checkoutUrl })`.
4. After payment, Stripe redirects to a success page that displays the license key.
5. User pastes it into the extension (same as Option A from here).

**Recommendation:** Start with Option A (manual key issuance) for the first 10 customers. Add full webhook automation after validating demand.

---

## Phase 3 — Entitlement refresh (1 day)

Once a license system exists, add periodic re-verification to handle cancellations/expirations.

### [MODIFY] [background.js](file:///Users/orlandoascanio/Desktop/App-Blocker-Extension/background.js)

Add an alarm that fires every 24 hours:

```js
chrome.alarms.create('resistgate-entitlement-refresh', { periodInMinutes: 1440 });
```

In the alarm handler, call the `/verify-license` endpoint and update storage. If the license is expired or revoked, downgrade to free tier and re-apply blocking rules.

---

## Phase 4 — Friction page UX polish (1–2 days)

The challenge page currently uses `confirm()` which is browser-native and ugly. Some users may also be confused by the single-button layout.

### [MODIFY] [friction-page/index.html](file:///Users/orlandoascanio/Desktop/App-Blocker-Extension/friction-page/index.html)

- Remove the `confirm()` dialog in `script.js:startChallengeFlow`. Replace it with an inline confirmation step inside the page itself.
- Add a visible countdown timer *before* the challenge starts (timed-wait mode already exists on the Pro path, but the free path has no warmup).
- Add better empty-state messaging when the blocked site name can't be parsed.

### [MODIFY] [friction-page/script.js](file:///Users/orlandoascanio/Desktop/App-Blocker-Extension/friction-page/script.js)

```diff
 function startChallengeFlow() {
-  if (!confirm('Ready to earn access with ResistGate? Complete 5 paragraphs with full accuracy.')) {
-    return;
-  }
   startTime = Date.now();
   startTypingChallenge(currentOriginalUrl);
 }
```

Replace with an in-page confirmation card rendered via `renderReadyState()`.

---

## Phase 5 — Chrome Web Store submission (2–4 days)

Before submitting, address these requirements:

### [MODIFY] [manifest.json](file:///Users/orlandoascanio/Desktop/App-Blocker-Extension/manifest.json)

- Add `"homepage_url"` pointing to your landing page.
- Add a `"web_accessible_resources"` entry for `friction-page/index.html` (required by MV3 for redirect targets).

### Required before submission

| Item | Status |
|---|---|
| Privacy policy URL | ❌ Not created |
| Landing page / website | ❌ Not created |
| Store screenshots (1280×800 or 640×400) | ❌ Not created |
| Promotional tile (440×280) | ❌ Not created |
| Icons at all required sizes (already in `icons/`) | ✅ |
| Justify `<all_urls>` host permission in listing description | Required |

---

## Phase 6 — Post-v1 backlog (after first 10 paying users)

Per ROADMAP.md, do not build these until revenue validates demand:

- Trend charts (Chart.js or canvas-based sparklines)
- Streak tracking
- Heat map visuals for distraction patterns
- Email weekly report (Resend or Postmark)
- Export report as PDF
- `chrome.storage.sync` for cross-device blocklist
- Team / shared blocklist mode

---

## Verification plan

### Automated tests

```bash
npm test                       # Vitest suite in tests/
npm test -- --coverage         # Check coverage report
```

### Manual smoke tests (must pass before any release)

1. Load unpacked extension → popup opens, no console errors.
2. Add `youtube.com` → visit `https://youtube.com` → redirected to friction page.
3. Complete typing challenge → access granted → site opens → re-blocked after timer.
4. Set manual override → wait delay → access granted without challenge.
5. Enable schedule → block outside schedule hours → no redirect (blocking inactive).
6. Activate Pro (via license key once built) → Analytics and Weekly Report tabs unlock.
7. Enable Strict Mode + schedule → attempt to save settings during active window → error shown.
8. Override 4× in < 6 hours → override locked for 30 minutes.
